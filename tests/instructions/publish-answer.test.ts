import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { ethers } from "ethers";
import { BankrunProvider } from "anchor-bankrun";
import {
  setupTestContext,
  initializeProtocol,
  TestContext,
  generateTestSignature,
} from "../setup";

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

describe("Publish Answer Instruction", () => {
  let ctx: TestContext;
  let publicFeedPDA: PublicKey;
  let personalFeedPDA: PublicKey;
  let dataSourcePDA: PublicKey;

  const publicFeedId = "public-feed-publish-test";
  const personalFeedId = "personal-feed-publish-test";

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);

    // Add nodes for signature verification
    for (let i = 0; i < 3; i++) {
      try {
        await ctx.molphaProgram.methods
          .addNode(ctx.nodes[i].publicKey)
          .accountsPartial({
            nodeRegistry: ctx.nodeRegistryPDA,
            authority: ctx.authority.publicKey,
          })
          .rpc();
      } catch (e) {
        // Ignore error if node already added
      }
    }

    // Generate test data source
    const { signature, address } = generateTestSignature(
      0, // Public data source
      "https://api.example.com/price",
      "Test Price Feed"
    );

    const dataSourceInfo = {
      dataSourceType: { public: {} },
      source: "https://api.example.com/price",
      ownerEth: Array.from(Buffer.from(address.slice(2), "hex")),
      name: "Test Price Feed",
      sig: Array.from(
        Buffer.concat([
          Buffer.from(signature.slice(2, -2), "hex"),
          Buffer.from([parseInt(signature.slice(-2), 16) - 27]),
        ])
      ),
    };

    // Compute data source ID using the same method as setup
    const dataSourceId = Buffer.from(
      ethers
        .keccak256(
          Buffer.concat([
            Buffer.from([0]), // dataSourceType: public = 0
            Buffer.from("https://api.example.com/price"),
            Buffer.from(address.slice(2), "hex"),
            Buffer.from("Test Price Feed"),
          ])
        )
        .slice(2),
      "hex"
    );

    [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    // Create data source
    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo)
        .accountsPartial({
          dataSource: dataSourcePDA,
          payer: ctx.authority.publicKey,
        })
        .rpc();
    } catch (e) {
      // Ignore if already exists
    }
    // Create public feed

    const publicFeedParams = {
      jobId: Array.from(Buffer.from(publicFeedId.padEnd(32, "\0"))),
      feedType: { public: {} },
      minSignaturesThreshold: 2,
      frequency: new anchor.BN(300),
      ipfsCid: "QmTestPublic",
      dataSourceId: Array.from(dataSourceId),
      name: publicFeedId,
    };

    [publicFeedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(publicFeedParams.name),
        Buffer.from([0]), // FeedType::Public = 0
        Buffer.from([publicFeedParams.minSignaturesThreshold]),
        publicFeedParams.frequency.toBuffer("le", 8),
        Buffer.from(publicFeedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createFeed(
          publicFeedParams,
          dataSourceInfo,
          new anchor.BN(86400),
          new anchor.BN(1000)
        )
        .accountsPartial({
          feed: publicFeedPDA,
          dataSource: dataSourcePDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();
    } catch (e) {
      // Ignore if already exists
    }

    // Create personal feed
    const personalFeedParams = {
      jobId: Array.from(Buffer.from(personalFeedId.padEnd(32, "\0"))),
      feedType: { personal: {} },
      minSignaturesThreshold: 2,
      frequency: new anchor.BN(300),
      ipfsCid: "QmTestPersonal",
      dataSourceId: Array.from(dataSourceId),
      name: personalFeedId,
    };

    [personalFeedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(personalFeedParams.name),
        Buffer.from([1]), // FeedType::Personal = 1
        Buffer.from([personalFeedParams.minSignaturesThreshold]),
        personalFeedParams.frequency.toBuffer("le", 8),
        Buffer.from(personalFeedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createFeed(
          personalFeedParams,
          dataSourceInfo,
          new anchor.BN(86400),
          new anchor.BN(1000)
        )
        .accountsPartial({
          feed: personalFeedPDA,
          dataSource: dataSourcePDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();
    } catch (e) {
      // Ignore if already exists
    }

    // Top up feeds with sufficient balance
    try {
      await ctx.molphaProgram.methods
        .topUp(new anchor.BN(100000)) // 100,000 lamports
        .accountsPartial({
          feed: publicFeedPDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();

      await ctx.molphaProgram.methods
        .topUp(new anchor.BN(100000)) // 100,000 lamports
        .accountsPartial({
          feed: personalFeedPDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();
    } catch (e) {
      // Ignore if already topped up
    }
  });

  describe("Basic Publishing", () => {
    it("Successfully publishes answer to public feed with valid signatures", async () => {
      const answer = {
        value: Array.from(
          Buffer.from(
            "1000000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ), // 32 bytes
        timestamp: await safePastOnchainTimestamp(
          ctx.molphaProgram.provider,
          100
        ),
      };

      // The message must be the answer value for signature verification
      const message = Buffer.from(answer.value);

      const signers = [ctx.nodes[0], ctx.nodes[1]]; // Use 2 signers to meet threshold

      // Add Ed25519 signature instructions
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
          feed: publicFeedPDA,
          nodeRegistry: ctx.nodeRegistryPDA,
          instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions(preIxs)
        .rpc();

      // Verify the answer was published
      const feed = await ctx.molphaProgram.account.feed.fetch(publicFeedPDA);
      assert.deepEqual(feed.latestAnswer.value, answer.value);
      assert.ok(feed.latestAnswer.timestamp.eq(answer.timestamp));

      // Verify answer history was updated
      assert.equal(feed.answerHistory.length, 1);
      assert.deepEqual(feed.answerHistory[0].value, answer.value);
    });

    it("Successfully publishes answer to personal feed with subscription", async () => {
      const answer = {
        value: Array.from(
          Buffer.from(
            "2000000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ), // 32 bytes
        timestamp: await safePastOnchainTimestamp(
          ctx.molphaProgram.provider,
          90
        ), // 5 seconds ago
      };

      // The message must be the answer value for signature verification
      const message = Buffer.from(answer.value);

      // Get initial feed balance
      const initialFeed = await ctx.molphaProgram.account.feed.fetch(
        personalFeedPDA
      );
      const initialBalance = initialFeed.balance;

      const signers = [ctx.nodes[0], ctx.nodes[1]];

      // Add Ed25519 signature instructions
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
          feed: personalFeedPDA,
          nodeRegistry: ctx.nodeRegistryPDA,
          instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions(preIxs)
        .rpc();

      // Verify the answer was published
      const feed = await ctx.molphaProgram.account.feed.fetch(personalFeedPDA);
      assert.deepEqual(feed.latestAnswer.value, answer.value);
      assert.ok(feed.latestAnswer.timestamp.eq(answer.timestamp));
    });
  });

  describe("Signature Validation", () => {
    it("Fails with insufficient signatures", async () => {
      const answer = {
        value: Array.from(
          Buffer.from(
            "3000000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ),
        timestamp: await safePastOnchainTimestamp(
          ctx.molphaProgram.provider,
          80
        ), // 3 seconds ago
      };

      // The message must be the answer value for signature verification
      const message = Buffer.from(answer.value);

      const signers = [ctx.nodes[0]];
      const preIxs = signers.map((signer) => {
        const signature = nacl.sign.detached(message, signer.secretKey);
        return anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: signer.publicKey.toBytes(),
          message,
          signature,
        });
      });

      try {
        await ctx.molphaProgram.methods
          .publishAnswer(answer)
          .accounts({
            feed: personalFeedPDA,
            nodeRegistry: ctx.nodeRegistryPDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .preInstructions(preIxs)
          .rpc();
        assert.fail("Should have failed with insufficient signatures");
      } catch (error: any) {
        const feed = await ctx.molphaProgram.account.feed.fetch(
          personalFeedPDA
        );
        console.log(
          "feed.latestAnswer.timestamp:",
          feed.latestAnswer.timestamp.toNumber()
        );
        console.log("answer.timestamp:", answer.timestamp.toNumber());
        console.log("myerror:", JSON.stringify(error));
        assert.ok(
          error.message.includes("NotEnoughSignatures") ||
            error.message.includes("custom program error")
        );
      }
    });

    it("Fails with signatures from non-registered nodes", async () => {
      const answer = {
        value: Array.from(
          Buffer.from(
            "4000000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ),
        timestamp: await safePastOnchainTimestamp(
          ctx.molphaProgram.provider,
          70
        ), // 2 seconds ago
      };

      // The message must be the answer value for signature verification
      const message = Buffer.from(answer.value);

      const transaction = new Transaction();

      // Use unregistered nodes
      const unregisteredNode1 = anchor.web3.Keypair.generate();
      const unregisteredNode2 = anchor.web3.Keypair.generate();

      const signers = [unregisteredNode1, unregisteredNode2];

      // Add Ed25519 signature instructions
      const preIxs = signers.map((signer) => {
        const signature = nacl.sign.detached(message, signer.secretKey);
        return anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: signer.publicKey.toBytes(),
          message,
          signature,
        });
      });

      try {
        // Build + send via Anchor (ensures correct accounts/ordering/provider)
        await ctx.molphaProgram.methods
          .publishAnswer(answer)
          .accounts({
            feed: personalFeedPDA,
            nodeRegistry: ctx.nodeRegistryPDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .preInstructions(preIxs)
          .rpc();

        assert.fail("Should have failed with unregistered node signatures");
      } catch (error: any) {
        assert.ok(
          error.message.includes("NotEnoughSignatures") ||
            error.message.includes("custom program error")
        );
      }
    });

    it("Fails with wrong message in signatures", async () => {
      const answer = {
        value: Array.from(
          Buffer.from(
            "5000000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ),
        timestamp: await safePastOnchainTimestamp(
          ctx.molphaProgram.provider,
          60
        ), // 1 second ago
      };

      // Sign a different message (not the answer value)
      const wrongMessage = Buffer.from("wrong-message-not-answer-value");

      const signers = [ctx.nodes[0], ctx.nodes[1]];

      // Add Ed25519 signature instructions
      const preIxs = signers.map((signer) => {
        const signature = nacl.sign.detached(wrongMessage, signer.secretKey);
        return anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: signer.publicKey.toBytes(),
          message: wrongMessage,
          signature,
        });
      });

      try {
        await ctx.molphaProgram.methods
          .publishAnswer(answer)
          .accounts({
            feed: publicFeedPDA,
            nodeRegistry: ctx.nodeRegistryPDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .preInstructions(preIxs)
          .rpc();
        assert.fail("Should have failed with wrong message signature");
      } catch (error: any) {
        assert.ok(
          error.message.includes("NotEnoughSignatures") ||
            error.message.includes("custom program error")
        );
      }
    });
  });

  describe("Timestamp Validation", () => {
    it("Fails with past timestamp", async () => {
      const message = Buffer.from("test-message-past");

      // Get current latest answer timestamp
      const currentFeed = await ctx.molphaProgram.account.feed.fetch(
        publicFeedPDA
      );
      const pastTimestamp = currentFeed.latestAnswer.timestamp.sub(
        new anchor.BN(1)
      );

      const answer = {
        value: Array.from(
          Buffer.from(
            "6000000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ),
        timestamp: pastTimestamp,
      };

      const transaction = new Transaction();
      const signers = [ctx.nodes[0], ctx.nodes[1]];

      for (const signer of signers) {
        const signature = nacl.sign.detached(message, signer.secretKey);
        const ix = anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: signer.publicKey.toBytes(),
          message,
          signature,
        });
        transaction.add(ix);
      }

      transaction.add(
        await ctx.molphaProgram.methods
          .publishAnswer(answer)
          .accountsPartial({
            feed: publicFeedPDA,
            nodeRegistry: ctx.nodeRegistryPDA,
            protocolConfig: ctx.protocolConfigPDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()
      );

      try {
        await ctx.provider.sendAndConfirm(transaction, [ctx.authority.payer]);
        assert.fail("Should have failed with past timestamp");
      } catch (error: any) {
        assert.ok(
          error.message.includes("PastTimestamp") ||
            error.message.includes("custom program error")
        );
      }
    });

    it("Fails with future timestamp", async () => {
      const message = Buffer.from("test-message-future");
      const futureTimestamp = new anchor.BN(
        Math.floor(Date.now() / 1000) + 3600
      ); // 1 hour in future

      const answer = {
        value: Array.from(
          Buffer.from(
            "7000000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ),
        timestamp: futureTimestamp,
      };

      const transaction = new Transaction();
      const signers = [ctx.nodes[0], ctx.nodes[1]];

      for (const signer of signers) {
        const signature = nacl.sign.detached(message, signer.secretKey);
        const ix = anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: signer.publicKey.toBytes(),
          message,
          signature,
        });
        transaction.add(ix);
      }

      transaction.add(
        await ctx.molphaProgram.methods
          .publishAnswer(answer)
          .accountsPartial({
            feed: publicFeedPDA,
            nodeRegistry: ctx.nodeRegistryPDA,
            protocolConfig: ctx.protocolConfigPDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()
      );

      try {
        await ctx.provider.sendAndConfirm(transaction, [ctx.authority.payer]);
        assert.fail("Should have failed with future timestamp");
      } catch (error: any) {
        assert.ok(
          error.message.includes("FutureTimestamp") ||
            error.message.includes("custom program error")
        );
      }
    });
  });

  describe("Feed Balance and Fees", () => {
    it("Fails when personal feed has insufficient balance", async () => {
      // First, drain the feed balance
      const feed = await ctx.molphaProgram.account.feed.fetch(personalFeedPDA);
      const protocolConfig =
        await ctx.molphaProgram.account.protocolConfig.fetch(
          ctx.protocolConfigPDA
        );

      // If balance is still sufficient, we need to publish enough answers to drain it
      let currentBalance = feed.balance;
      let drainCounter = 0;
      let lastTimestamp = feed.latestAnswer.timestamp;

      while (currentBalance.gte(protocolConfig.feePerUpdate)) {
        const answer = {
          value: Array.from(
            Buffer.from(
              `800000000000000000000000000000000000000000000000000000000000000${drainCounter.toString(
                16
              )}`,
              "hex"
            )
          ),
          timestamp: lastTimestamp.add(new anchor.BN(1)), // Increment timestamp
        };
        lastTimestamp = answer.timestamp;

        // The message must be the answer value for signature verification
        const message = Buffer.from(answer.value);

        const transaction = new Transaction();
        const signers = [ctx.nodes[0], ctx.nodes[1]];

        for (const signer of signers) {
          const signature = nacl.sign.detached(message, signer.secretKey);
          const ix = anchor.web3.Ed25519Program.createInstructionWithPublicKey({
            publicKey: signer.publicKey.toBytes(),
            message,
            signature,
          });
          transaction.add(ix);
        }

        transaction.add(
          await ctx.molphaProgram.methods
            .publishAnswer(answer)
            .accountsPartial({
              feed: personalFeedPDA,
              nodeRegistry: ctx.nodeRegistryPDA,
              protocolConfig: ctx.protocolConfigPDA,
              instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            })
            .instruction()
        );

        try {
          await ctx.provider.sendAndConfirm(transaction, [ctx.authority.payer]);
          const newFeed = await ctx.molphaProgram.account.feed.fetch(
            personalFeedPDA
          );
          currentBalance = newFeed.balance;
          drainCounter++;

          // Add small delay to ensure timestamp progression
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (e) {
          break;
        }
      }

      // Now try to publish with insufficient balance
      const answer = {
        value: Array.from(
          Buffer.from(
            "9000000000000000000000000000000000000000000000000000000000000000",
            "hex"
          )
        ),
        timestamp: new anchor.BN(Math.floor(Date.now() / 1000) - 1), // 1 second ago
      };

      // The message must be the answer value for signature verification
      const message = Buffer.from(answer.value);

      const transaction = new Transaction();
      const signers = [ctx.nodes[0], ctx.nodes[1]];

      for (const signer of signers) {
        const signature = nacl.sign.detached(message, signer.secretKey);
        const ix = anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: signer.publicKey.toBytes(),
          message,
          signature,
        });
        transaction.add(ix);
      }

      transaction.add(
        await ctx.molphaProgram.methods
          .publishAnswer(answer)
          .accountsPartial({
            feed: personalFeedPDA,
            nodeRegistry: ctx.nodeRegistryPDA,
            protocolConfig: ctx.protocolConfigPDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()
      );

      try {
        await ctx.provider.sendAndConfirm(transaction, [ctx.authority.payer]);
        assert.fail("Should have failed with insufficient balance");
      } catch (error: any) {
        assert.ok(
          error.message.includes("InsufficientBalance") ||
            error.message.includes("custom program error")
        );
      }
    });
  });

  describe("Answer History Management", () => {
    it("Maintains answer history with ring buffer", async () => {
      // Create a new feed for history testing
      const historyFeedId = "history-test-feed";
      const historyFeedName = historyFeedId; // Use the same value for consistency
      const historyFeedParams = {
        jobId: Array.from(Buffer.from(historyFeedId.padEnd(32, "\0"))),
        feedType: { public: {} },
        minSignaturesThreshold: 2,
        frequency: new anchor.BN(300),
        ipfsCid: "QmHistoryTest",
        dataSourceId: Array.from(Buffer.alloc(32)), // Will be set later
        name: historyFeedName,
      };

      const [historyFeedPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("feed"),
          ctx.authority.publicKey.toBuffer(),
          Buffer.from(historyFeedParams.name),
          Buffer.from([0]), // FeedType::Public.to_seed() = [0]
          Buffer.from([historyFeedParams.minSignaturesThreshold]), // u8.to_le_bytes() = [value]
          historyFeedParams.frequency.toBuffer("le", 8),
          Buffer.from(historyFeedParams.jobId),
        ],
        ctx.molphaProgram.programId
      );

      // Generate test data source for history feed
      const { signature, address } = generateTestSignature(
        0,
        "https://api.history.com/price",
        "History Test Feed"
      );

      const dataSourceInfo = {
        dataSourceType: { public: {} },
        source: "https://api.history.com/price",
        ownerEth: Array.from(Buffer.from(address.slice(2), "hex")),
        name: "History Test Feed",
        sig: Array.from(
          Buffer.concat([
            Buffer.from(signature.slice(2, -2), "hex"),
            Buffer.from([parseInt(signature.slice(-2), 16) - 27]),
          ])
        ),
      };

      const dataSourceId = Buffer.from(
        ethers
          .keccak256(
            Buffer.concat([
              Buffer.from([0]),
              Buffer.from("https://api.history.com/price"),
              Buffer.from(address.slice(2), "hex"),
              Buffer.from("History Test Feed"),
            ])
          )
          .slice(2),
        "hex"
      );

      const [historyDataSourcePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("data_source"), dataSourceId],
        ctx.molphaProgram.programId
      );

      // Update the feed params with the correct data source ID
      historyFeedParams.dataSourceId = Array.from(dataSourceId);

      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo)
        .accountsPartial({
          dataSource: historyDataSourcePDA,
          payer: ctx.authority.publicKey,
        })
        .rpc();

      await ctx.molphaProgram.methods
        .createFeed(
          historyFeedParams,
          dataSourceInfo,
          new anchor.BN(86400),
          new anchor.BN(1000)
        )
        .accountsPartial({
          feed: historyFeedPDA,
          dataSource: historyDataSourcePDA,
          authority: ctx.authority.publicKey,
          protocolConfig: ctx.protocolConfigPDA,
        })
        .rpc();

      // Top up the history feed with sufficient balance
      await ctx.molphaProgram.methods
        .topUp(new anchor.BN(100000)) // 100,000 lamports
        .accountsPartial({
          feed: historyFeedPDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();

      // Publish multiple answers to test history
      const numAnswers = 5;
      for (let i = 0; i < numAnswers; i++) {
        const answer = {
          value: Array.from(
            Buffer.from(`${i.toString().padStart(64, "0")}`, "hex")
          ),
          timestamp: new anchor.BN(Math.floor(Date.now() / 1000) - 100 + i), // Start from 100 seconds ago
        };

        // The message must be the answer value for signature verification
        const message = Buffer.from(answer.value);

        // Create signature instructions like the working tests
        const preIxs: anchor.web3.TransactionInstruction[] = [];
        const signers = [ctx.nodes[0], ctx.nodes[1]];

        signers.forEach((signer) => {
          const signature = nacl.sign.detached(message, signer.secretKey);
          const ix = anchor.web3.Ed25519Program.createInstructionWithPublicKey({
            publicKey: signer.publicKey.toBytes(),
            message,
            signature,
          });
          preIxs.push(ix);
        });

        // Use the same pattern as working tests
        await ctx.molphaProgram.methods
          .publishAnswer(answer)
          .accounts({
            feed: historyFeedPDA,
            nodeRegistry: ctx.nodeRegistryPDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .preInstructions(preIxs)
          .rpc();

        // Small delay to ensure timestamp progression
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Verify history was maintained
      const feed = await ctx.molphaProgram.account.feed.fetch(historyFeedPDA);
      assert.equal(feed.answerHistory.length, numAnswers);

      // Verify latest answer is correct
      const expectedLatestValue = Array.from(
        Buffer.from(`${(numAnswers - 1).toString().padStart(64, "0")}`, "hex")
      );
      assert.deepEqual(feed.latestAnswer.value, expectedLatestValue);

      // Verify history contains all answers in order
      for (let i = 0; i < numAnswers; i++) {
        const expectedValue = Array.from(
          Buffer.from(`${i.toString().padStart(64, "0")}`, "hex")
        );
        assert.deepEqual(feed.answerHistory[i].value, expectedValue);
      }
    });
  });
});
