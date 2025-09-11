import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  setupTestContext,
  initializeProtocol,
  TestContext,
  createTestDataSourceInfo,
  generateTestSignature,
  computeDataSourceId,
} from "../setup";
import { BankrunProvider } from "anchor-bankrun";

async function safePastOnchainTimestamp(
  provider: BankrunProvider | any, // works with BankrunProvider too
  secondsInPast = 1
): Promise<anchor.BN> {
  const client = provider.connection.banksClient.inner;
  const clock = await client.getClock();
  const timestamp = new anchor.BN(
    Math.max(0, Number(clock.unixTimestamp) - secondsInPast)
  );
  return timestamp;
}

describe("Integration Tests: Complete Oracle Flow", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);
  });

  describe("Complete Flow: Add Nodes → Create Data Source → Create Feed → Publish Data", () => {
    it("Executes complete public feed workflow successfully", async () => {
      // Step 1: Add nodes to the registry
      console.log("Step 1: Adding nodes to registry...");
      const nodesToAdd = [ctx.nodes[0], ctx.nodes[1], ctx.nodes[2]]; // Add 3 nodes

      for (const node of nodesToAdd) {
        await ctx.molphaProgram.methods
          .addNode(node.publicKey)
          .accountsPartial({
            nodeRegistry: ctx.nodeRegistryPDA,
            authority: ctx.authority.publicKey,
          })
          .rpc();
      }

      // Verify nodes were added
      const nodeRegistry = await ctx.molphaProgram.account.nodeRegistry.fetch(
        ctx.nodeRegistryPDA
      );
      assert.ok(
        nodeRegistry.nodes.some((n) => n.equals(nodesToAdd[0].publicKey))
      );
      assert.ok(
        nodeRegistry.nodes.some((n) => n.equals(nodesToAdd[1].publicKey))
      );
      assert.ok(
        nodeRegistry.nodes.some((n) => n.equals(nodesToAdd[2].publicKey))
      );

      // Step 2: Create data source
      console.log("Step 2: Creating data source...");
      const { signature, address } = generateTestSignature(
        0, // Public
        "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
        "Kraken Bitcoin Price Integration Test"
      );

      const testData = {
        dataSourceType: 0, // Public
        source: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
        owner: address,
        name: "Kraken Bitcoin Price Integration Test",
      };

      const dataSourceInfo = createTestDataSourceInfo(
        testData.dataSourceType,
        testData.source,
        testData.owner,
        testData.name,
        signature
      );

      const dataSourceId = computeDataSourceId({
        dataSourceType: testData.dataSourceType,
        ownerEth: testData.owner,
        name: testData.name,
        source: testData.source,
      });

      const [dataSourcePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("data_source"), dataSourceId],
        ctx.molphaProgram.programId
      );

      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo as any)
        .accountsPartial({
          dataSource: dataSourcePDA,
          payer: ctx.authority.publicKey,
        })
        .rpc();

      // Verify data source was created
      const dataSourceAccount =
        await ctx.molphaProgram.account.dataSource.fetch(dataSourcePDA);
      assert.deepEqual(dataSourceAccount.id, Array.from(dataSourceId));
      assert.deepEqual(dataSourceAccount.dataSourceType, { public: {} });
      assert.equal(dataSourceAccount.ownerEth.length, 20);

      // Step 3: Create feed using the data source
      console.log("Step 3: Creating feed...");
      const feedId = "integration-kraken-feed";
      const feedParams = {
        name: feedId,
        jobId: Array.from(Buffer.from(feedId.padEnd(32, "\0"))),
        feedType: { public: {} },
        minSignaturesThreshold: 2, // Require 2 out of 3 nodes
        frequency: new anchor.BN(600), // 10 minutes
        ipfsCid: "QmIntegrationTest123",
        dataSourceId: Array.from(dataSourceId),
      };

      const [feedPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("feed"),
          ctx.authority.publicKey.toBuffer(),
          Buffer.from(feedParams.name),
          Buffer.from([0]), // FeedType::Public = 0
          Buffer.from([feedParams.minSignaturesThreshold]),
          feedParams.frequency.toBuffer("le", 8),
          Buffer.from(feedParams.jobId),
        ],
        ctx.molphaProgram.programId
      );

      const subscriptionDurationSeconds = new anchor.BN(86400); // 1 day
      const priorityFeeBudget = new anchor.BN(1000); // 1000 lamports

      await ctx.molphaProgram.methods
        .createFeed(
          feedParams as any,
          dataSourceInfo as any,
          subscriptionDurationSeconds,
          priorityFeeBudget
        )
        .accountsPartial({
          feed: feedPDA,
          dataSource: dataSourcePDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();

      // Verify feed was created
      console.log("Verifying feed was created...");
      console.log("feedPDA:", feedPDA.toBase58());
      const feed = await ctx.molphaProgram.account.feed.fetch(feedPDA);
      assert.ok(feed.authority.equals(ctx.authority.publicKey));
      assert.deepEqual(feed.feedType, { public: {} });
      assert.deepEqual(feed.dataSourceId, Array.from(dataSourceId));
      assert.equal(feed.minSignaturesThreshold, 2);
      assert.equal(feed.frequency.toNumber(), 600);
      assert.equal(feed.ipfsCid, "QmIntegrationTest123");

      // Step 4: Publish data to the feed
      console.log("Step 4: Publishing data to feed...");
      const answer = {
        value: Array.from(
          Buffer.from(
            "5000000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ), // 32 bytes representing price data
        timestamp: await safePastOnchainTimestamp(ctx.molphaProgram.provider, 10), // 10 seconds ago
      };

      // Create message for signature verification (must match answer.value)
      const message = Buffer.from(answer.value);

      // Create transaction with Ed25519 signatures from 2 nodes
      const signers = [nodesToAdd[0], nodesToAdd[1]]; // Use 2 signers to meet threshold

      // Add publish answer instruction
      // Create Ed25519 pre-instructions from 2 nodes
      const preIxs = signers.map((signer) => {
        const signature = nacl.sign.detached(message, signer.secretKey);
        return anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: signer.publicKey.toBytes(),
          message,
          signature,
        });
      });

      // Build + send via Anchor (ensures correct accounts/ordering/provider)
      await ctx.molphaProgram.methods
        .publishAnswer(answer)
        .accounts({
          feed: feedPDA,
          nodeRegistry: ctx.nodeRegistryPDA,
          instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions(preIxs)
        .rpc();

      // Verify the answer was published
      const updatedFeed = await ctx.molphaProgram.account.feed.fetch(feedPDA);
      assert.deepEqual(updatedFeed.latestAnswer.value, answer.value);
      assert.ok(updatedFeed.latestAnswer.timestamp.eq(answer.timestamp));

      // Verify answer history was updated
      assert.equal(updatedFeed.answerHistory.length, 1);
      assert.deepEqual(updatedFeed.answerHistory[0].value, answer.value);

      console.log("✅ Complete public feed workflow executed successfully!");
    });

    it("Executes complete personal feed workflow with subscription", async () => {
      // Step 1: Add nodes (reuse from previous test)
      console.log("Step 1: Adding nodes to registry...");
      const nodesToAdd = [ctx.nodes[0], ctx.nodes[1], ctx.nodes[2]];

      for (const node of nodesToAdd) {
        try {
          await ctx.molphaProgram.methods
            .addNode(node.publicKey)
            .accounts({
              nodeRegistry: ctx.nodeRegistryPDA,
              authority: ctx.authority.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
        } catch (e) {
          // Ignore if already added
        }
      }

      // Step 2: Create private data source
      console.log("Step 2: Creating private data source...");
      const { signature, address } = generateTestSignature(
        1, // Private
        "https://private-api.example.com/btc-price",
        "Private API Integration Test"
      );

      const testData = {
        dataSourceType: 1, // Private
        source: "https://private-api.example.com/btc-price",
        owner: address,
        name: "Private API Integration Test",
      };

      const dataSourceInfo = createTestDataSourceInfo(
        testData.dataSourceType,
        testData.source,
        testData.owner,
        testData.name,
        signature
      );

      const dataSourceId = computeDataSourceId({
        dataSourceType: testData.dataSourceType,
        ownerEth: testData.owner,
        name: testData.name,
        source: testData.source,
      });

      const [dataSourcePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("data_source"), dataSourceId],
        ctx.molphaProgram.programId
      );

      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo as any)
        .accountsPartial({
          dataSource: dataSourcePDA,
          payer: ctx.authority.publicKey,
        })
        .rpc();

      // Step 3: Create personal feed
      console.log("Step 3: Creating personal feed...");
      const feedId = "integration-private-feed";
      const feedParams = {
        name: feedId,
        jobId: Array.from(Buffer.from(feedId.padEnd(32, "\0"))),
        feedType: { personal: {} },
        minSignaturesThreshold: 1, // Require only 1 signature for personal feed
        frequency: new anchor.BN(900), // 15 minutes
        ipfsCid: "QmPrivateIntegrationTest",
        dataSourceId: Array.from(dataSourceId),
      };

      const [feedPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("feed"),
          ctx.authority.publicKey.toBuffer(),
          Buffer.from(feedParams.name),
          Buffer.from([1]), // FeedType::Personal = 1
          Buffer.from([feedParams.minSignaturesThreshold]),
          feedParams.frequency.toBuffer("le", 8),
          Buffer.from(feedParams.jobId),
        ],
        ctx.molphaProgram.programId
      );

      const subscriptionDurationSeconds = new anchor.BN(86400); // 1 day
      const priorityFeeBudget = new anchor.BN(2000); // 2000 lamports

      await ctx.molphaProgram.methods
        .createFeed(
          feedParams as any,
          dataSourceInfo as any,
          subscriptionDurationSeconds,
          priorityFeeBudget
        )
        .accountsPartial({
          feed: feedPDA,
          dataSource: dataSourcePDA,
          authority: ctx.authority.publicKey,
          protocolConfig: ctx.protocolConfigPDA,
        })
        .rpc();

      // Step 4: Top up the feed with balance for operations
      console.log("Step 4: Topping up feed balance...");
      const topUpAmount = new anchor.BN(1000000); // 1 SOL equivalent in lamports

      await ctx.molphaProgram.methods
        .topUp(topUpAmount)
        .accounts({
          feed: feedPDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();

      // Verify feed balance was topped up
      const feedAfterTopUp = await ctx.molphaProgram.account.feed.fetch(
        feedPDA
      );
      assert.ok(feedAfterTopUp.balance.gte(topUpAmount));

      // Step 5: Publish data to the personal feed
      console.log("Step 5: Publishing data to personal feed...");
      const answer = {
        value: Array.from(
          Buffer.from(
            "7500000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ), // 32 bytes representing different price data
        timestamp: await safePastOnchainTimestamp(ctx.molphaProgram.provider, 5), // 5 seconds ago
      };

      const message = Buffer.from(answer.value);

      // Create signature instructions like the working tests
      const preIxs: anchor.web3.TransactionInstruction[] = [];
      const signer = nodesToAdd[0]; // Use 1 signer to meet threshold

      // Add Ed25519 signature instruction
      const signature_bytes = nacl.sign.detached(message, signer.secretKey);
      const ix = anchor.web3.Ed25519Program.createInstructionWithPublicKey({
        publicKey: signer.publicKey.toBytes(),
        message,
        signature: signature_bytes,
      });
      preIxs.push(ix);

      // Use the same pattern as working tests
      await ctx.molphaProgram.methods
        .publishAnswer(answer)
        .accounts({
          feed: feedPDA,
          nodeRegistry: ctx.nodeRegistryPDA,
          protocolConfig: ctx.protocolConfigPDA,
          instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions(preIxs)
        .rpc();

      // Verify the answer was published
      const updatedFeed = await ctx.molphaProgram.account.feed.fetch(feedPDA);
      assert.deepEqual(updatedFeed.latestAnswer.value, answer.value);
      assert.ok(updatedFeed.latestAnswer.timestamp.eq(answer.timestamp));

      console.log("✅ Complete personal feed workflow executed successfully!");
    });

    it("Fails to publish data with insufficient signatures", async () => {
      // Create a feed with high signature threshold
      const feedId = "high-threshold-feed";
      const { signature, address } = generateTestSignature(
        0, // Public
        "https://api.example.com/high-threshold",
        "High Threshold Test"
      );

      const dataSourceInfo = createTestDataSourceInfo(
        0,
        "https://api.example.com/high-threshold",
        address,
        "High Threshold Test",
        signature
      );

      const dataSourceId = computeDataSourceId({
        dataSourceType: 0,
        ownerEth: address,
        name: "High Threshold Test",
        source: "https://api.example.com/high-threshold",
      });

      const [dataSourcePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("data_source"), dataSourceId],
        ctx.molphaProgram.programId
      );

      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo as any)
        .accounts({
          dataSource: dataSourcePDA,
          payer: ctx.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const feedParams = {
        name: feedId,
        jobId: Array.from(Buffer.from(feedId.padEnd(32, "\0"))),
        feedType: { public: {} },
        minSignaturesThreshold: 3, // Require 3 signatures
        frequency: new anchor.BN(300),
        ipfsCid: "QmHighThreshold",
        dataSourceId: Array.from(dataSourceId),
      };

      const [feedPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("feed"),
          ctx.authority.publicKey.toBuffer(),
          Buffer.from(feedParams.name),
          Buffer.from([0]),
          Buffer.from([feedParams.minSignaturesThreshold]),
          feedParams.frequency.toBuffer("le", 8),
          Buffer.from(feedParams.jobId),
        ],
        ctx.molphaProgram.programId
      );

      const subscriptionDurationSeconds = new anchor.BN(86400);
      const priorityFeeBudget = new anchor.BN(1000);

      await ctx.molphaProgram.methods
        .createFeed(
          feedParams as any,
          dataSourceInfo as any,
          subscriptionDurationSeconds,
          priorityFeeBudget
        )
        .accounts({
          feed: feedPDA,
          dataSource: dataSourcePDA,
          authority: ctx.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Try to publish with only 2 signatures (below threshold of 3)
      const answer = {
        value: Array.from(
          Buffer.from(
            "1000000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ),
        timestamp: await safePastOnchainTimestamp(ctx.molphaProgram.provider, 10),
      };

      const message = Buffer.from(answer.value);
      const transaction = new Transaction();

      // Add only 2 signatures (below threshold)
      const signers = [ctx.nodes[0], ctx.nodes[1]];
      for (const signer of signers) {
        const signature_bytes = nacl.sign.detached(message, signer.secretKey);
        const ix = anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: signer.publicKey.toBytes(),
          message,
          signature: signature_bytes,
        });
        transaction.add(ix);
      }

      transaction.add(
        await ctx.molphaProgram.methods
          .publishAnswer(answer)
          .accounts({
            feed: feedPDA,
            nodeRegistry: ctx.nodeRegistryPDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()
      );

      // This should fail due to insufficient signatures
      try {
        await ctx.provider.sendAndConfirm(transaction, [ctx.authority.payer]);
        assert.fail("Should have failed due to insufficient signatures");
      } catch (error: any) {
        assert.ok(
          error.message.includes("NotEnoughSignatures") ||
            error.message.includes("custom program error"),
          "Should fail with signature threshold error"
        );
      }

      console.log(
        "✅ Correctly failed to publish with insufficient signatures!"
      );
    });

    it("Demonstrates multi-feed data source sharing", async () => {
      // Create a shared data source
      const { signature, address } = generateTestSignature(
        0, // Public
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        "Shared CoinGecko Data Source"
      );

      const sharedDataSource = {
        dataSourceType: 0,
        source:
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        owner: address,
        name: "Shared CoinGecko Data Source",
      };

      const dataSourceInfo = createTestDataSourceInfo(
        sharedDataSource.dataSourceType,
        sharedDataSource.source,
        sharedDataSource.owner,
        sharedDataSource.name,
        signature
      );

      const dataSourceId = computeDataSourceId({
        dataSourceType: sharedDataSource.dataSourceType,
        ownerEth: sharedDataSource.owner,
        name: sharedDataSource.name,
        source: sharedDataSource.source,
      });

      const [dataSourcePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("data_source"), dataSourceId],
        ctx.molphaProgram.programId
      );

      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo as any)
        .accounts({
          dataSource: dataSourcePDA,
          payer: ctx.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Create multiple feeds using the same data source
      const feedConfigs = [
        {
          id: "shared-feed-public",
          type: { public: {} },
          threshold: 2,
          frequency: 300,
        },
        {
          id: "shared-feed-personal",
          type: { personal: {} },
          threshold: 1,
          frequency: 600,
        },
      ];

      const createdFeeds = [];

      for (const config of feedConfigs) {
        const feedParams = {
          name: config.id,
          jobId: Array.from(Buffer.from(config.id.padEnd(32, "\0"))),
          feedType: config.type,
          minSignaturesThreshold: config.threshold,
          frequency: new anchor.BN(config.frequency),
          ipfsCid: `QmShared${config.id}`,
          dataSourceId: Array.from(dataSourceId),
        };

        const feedTypeValue = config.type.public ? 0 : 1;
        const [feedPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("feed"),
            ctx.authority.publicKey.toBuffer(),
            Buffer.from(feedParams.name),
            Buffer.from([feedTypeValue]),
            Buffer.from([feedParams.minSignaturesThreshold]),
            feedParams.frequency.toBuffer("le", 8),
            Buffer.from(feedParams.jobId),
          ],
          ctx.molphaProgram.programId
        );

        const subscriptionDurationSeconds = new anchor.BN(86400);
        const priorityFeeBudget = new anchor.BN(1000);

        await ctx.molphaProgram.methods
          .createFeed(
            feedParams as any,
            dataSourceInfo as any,
            subscriptionDurationSeconds,
            priorityFeeBudget
          )
          .accounts({
            feed: feedPDA,
            dataSource: dataSourcePDA,
            authority: ctx.authority.publicKey,
            protocolConfig: ctx.protocolConfigPDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        createdFeeds.push({ pda: feedPDA, config });
      }

      // Publish data to both feeds
      for (const { pda, config } of createdFeeds) {
        const answer = {
          value: Array.from(
            Buffer.from(
              "8000000000000000000000000000000000000000000000000000000000000000",
              "hex"
            )
          ),
          timestamp: await safePastOnchainTimestamp(ctx.molphaProgram.provider, 15),
        };

        const message = Buffer.from(answer.value);

        // Create signature instructions like the working tests
        const preIxs: anchor.web3.TransactionInstruction[] = [];
        const numSignatures = config.threshold;
        for (let i = 0; i < numSignatures; i++) {
          const signer = ctx.nodes[i];
          const signature_bytes = nacl.sign.detached(message, signer.secretKey);
          const ix = anchor.web3.Ed25519Program.createInstructionWithPublicKey({
            publicKey: signer.publicKey.toBytes(),
            message,
            signature: signature_bytes,
          });
          preIxs.push(ix);
        }

        // Use the same pattern as working tests
        await ctx.molphaProgram.methods
          .publishAnswer(answer)
          .accounts({
            feed: pda,
            nodeRegistry: ctx.nodeRegistryPDA,
            protocolConfig: ctx.protocolConfigPDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .preInstructions(preIxs)
          .rpc();

        // Verify data was published
        const feed = await ctx.molphaProgram.account.feed.fetch(pda);
        assert.deepEqual(feed.latestAnswer.value, answer.value);
        assert.deepEqual(feed.dataSourceId, Array.from(dataSourceId));
      }

      console.log(
        "✅ Multi-feed data source sharing demonstrated successfully!"
      );
    });
  });
});
