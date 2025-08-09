import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Molpha } from "../target/types/molpha";
import { assert } from "chai";
import {
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} from "@solana/web3.js";
import nacl from "tweetnacl";

describe("molpha", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const molphaProgram = anchor.workspace.Molpha as Program<Molpha>;
  const authority = provider.wallet as anchor.Wallet;

  const [nodeRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("node-registry")],
    molphaProgram.programId
  );

  const [protocolConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    molphaProgram.programId
  );
  
  const nodes: Keypair[] = [];
  const MAX_NODES = 5;

  before(async () => {
    for (let i = 0; i < MAX_NODES; i++) {
      nodes.push(Keypair.generate());
    }

    // Initialize the node registry
    try {
      await molphaProgram.methods
        .initialize()
        .accounts({
          nodeRegistry: nodeRegistryPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Ignore error if already initialized
    }

    // Initialize the protocol config
    try {
      await molphaProgram.methods
        .initializeProtocol(new anchor.BN(1000)) // 1000 lamports per update
        .accounts({
          protocolConfig: protocolConfigPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Ignore error if already initialized
    }
  });

  describe("Node Registry", () => {
    it("Initializes the node registry PDA", async () => {
      const registryAccount = await molphaProgram.account.nodeRegistry.fetch(
        nodeRegistryPDA
      );
      assert.ok(registryAccount.authority.equals(authority.publicKey));
      assert.equal(registryAccount.nodes.length, 0);
    });

    it("Adds a node", async () => {
      const nodeToAdd = nodes[0];
      await molphaProgram.methods
        .addNode(nodeToAdd.publicKey)
        .accounts({
          nodeRegistry: nodeRegistryPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const registryAccount = await molphaProgram.account.nodeRegistry.fetch(
        nodeRegistryPDA
      );
      assert.equal(registryAccount.nodes.length, 1);
      assert.ok(registryAccount.nodes[0].equals(nodeToAdd.publicKey));
    });

    it("Fails to add a duplicate node", async () => {
      const nodeToAdd = nodes[0];
      try {
        await molphaProgram.methods
          .addNode(nodeToAdd.publicKey)
          .accounts({
            nodeRegistry: nodeRegistryPDA,
            authority: authority.publicKey,
          })
          .rpc();
        assert.fail("Should have failed to add a duplicate node.");
      } catch (error) {
        assert.equal(error.error.errorCode.code, "NodeAlreadyAdded");
      }
    });

    it("Removes a node", async () => {
      const nodeToRemove = nodes[0];
      await molphaProgram.methods
        .removeNode(nodeToRemove.publicKey)
        .accounts({
          nodeRegistry: nodeRegistryPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const registryAccount = await molphaProgram.account.nodeRegistry.fetch(
        nodeRegistryPDA
      );
      assert.equal(registryAccount.nodes.length, 0);
    });
  });

  describe("Feed Management", () => {
    it("Creates a new public feed", async () => {
      const feedId = "public-feed-for-create";
      const [feedAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("feed"), authority.publicKey.toBuffer(), Buffer.from(feedId)],
        molphaProgram.programId
      );
      await molphaProgram.methods
        .createFeed({
          feedId,
          feedType: { public: {} },
          minSignaturesThreshold: 1,
          frequency: new anchor.BN(60),
          ipfsCid: "cid",
        })
        .accounts({
          feedAccount: feedAccountPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      const feedAccount = await molphaProgram.account.feedAccount.fetch(feedAccountPDA);
      assert.ok(feedAccount.authority.equals(authority.publicKey));
      assert.deepEqual(feedAccount.feedType, { public: {} });
      assert.equal(feedAccount.minSignaturesThreshold, 1);
      assert.equal(feedAccount.frequency.toNumber(), 60);
      assert.equal(feedAccount.ipfsCid, "cid");
    });

    it("Updates a personal feed's config", async () => {
      const personalFeedId = "personal-feed-for-update";
      const [personalFeedPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("feed"), authority.publicKey.toBuffer(), Buffer.from(personalFeedId)],
        molphaProgram.programId
      );
      
      await molphaProgram.methods
        .createFeed({
          feedId: personalFeedId,
          feedType: { personal: {} },
          minSignaturesThreshold: 1,
          frequency: new anchor.BN(30),
          ipfsCid: "personal_initial_cid",
        })
        .accounts({
          feedAccount: personalFeedPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const updateParams = {
        minSignaturesThreshold: 5,
        frequency: new anchor.BN(120),
        ipfsCid: "personal_updated_cid",
      };
      await molphaProgram.methods
        .updateFeedConfig(updateParams)
        .accounts({
          feedAccount: personalFeedPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const feedAccount = await molphaProgram.account.feedAccount.fetch(personalFeedPDA);
      assert.equal(feedAccount.minSignaturesThreshold, 5);
      assert.equal(feedAccount.frequency.toNumber(), 120);
      assert.equal(feedAccount.ipfsCid, "personal_updated_cid");
    });

    it("Fails to update a public feed's config", async () => {
      const feedId = "public-feed-for-fail-update";
      const [publicFeedPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("feed"), authority.publicKey.toBuffer(), Buffer.from(feedId)],
        molphaProgram.programId
      );
      await molphaProgram.methods
        .createFeed({
          feedId,
          feedType: { public: {} },
          minSignaturesThreshold: 1,
          frequency: new anchor.BN(60),
          ipfsCid: "cid",
        })
        .accounts({
          feedAccount: publicFeedPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      const updateParams = {
        minSignaturesThreshold: 5,
        frequency: new anchor.BN(120),
        ipfsCid: "updated_cid",
      };
      try {
        await molphaProgram.methods
          .updateFeedConfig(updateParams)
          .accounts({
            feedAccount: publicFeedPDA,
            authority: authority.publicKey,
          })
          .rpc();
        assert.fail("Should have failed to update a public feed.");
      } catch (error) {
        assert.equal(error.error.errorCode.code, "NotSupported");
      }
    });
  });

  describe("Subscriptions", () => {
    const personalFeedId = "personal-feed-for-subs";
    let personalFeedPDA: PublicKey;
    
    before(async () => {
      // Create a personal feed for subscription tests
      [personalFeedPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("feed"), authority.publicKey.toBuffer(), Buffer.from(personalFeedId)],
        molphaProgram.programId
      );
      try {
        await molphaProgram.methods
          .createFeed({
            feedId: personalFeedId,
            feedType: { personal: {} },
            minSignaturesThreshold: 1,
            frequency: new anchor.BN(60),
            ipfsCid: "personal_cid",
          })
          .accounts({
            feedAccount: personalFeedPDA,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (e) {
        // Ignore error if already created
      }
    });

    it("Creates a new subscription for the feed owner", async () => {
      const [subscriptionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("subscription"), authority.publicKey.toBuffer(), personalFeedPDA.toBuffer()],
        molphaProgram.programId
      );
  
      await molphaProgram.methods
        .subscribe()
        .accounts({
          subscriptionAccount: subscriptionPDA,
          feedAccount: personalFeedPDA,
          consumer: authority.publicKey,
          payer: authority.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
  
      const subscriptionAccount = await molphaProgram.account.subscriptionAccount.fetch(subscriptionPDA);
      assert.ok(subscriptionAccount.owner.equals(authority.publicKey));
      assert.equal(subscriptionAccount.balance.toNumber(), 0);
    });

    it("Tops up a subscription", async () => {
      const [subscriptionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("subscription"), authority.publicKey.toBuffer(), personalFeedPDA.toBuffer()],
        molphaProgram.programId
      );
      const topUpAmount = new anchor.BN(100000); // 0.0001 SOL
  
      await molphaProgram.methods
        .topUp(topUpAmount)
        .accounts({
          subscriptionAccount: subscriptionPDA,
          owner: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
  
      const subscriptionAccount = await molphaProgram.account.subscriptionAccount.fetch(subscriptionPDA);
      assert.equal(subscriptionAccount.balance.toNumber(), topUpAmount.toNumber());
    });
  });

  describe("Signature Verification and Publishing", () => {
    const message = Buffer.from("Test message for integrated publishing");
    const minSignatures = 2;
    const feedId = "test-feed-integrated";
    
    let feedAccountPDA: PublicKey;
    let subscriptionPDA: PublicKey;

    before(async () => {
      // Add nodes for verification
      for (let i = 0; i < 3; i++) {
        try {
          await molphaProgram.methods
            .addNode(nodes[i].publicKey)
            .accounts({
              nodeRegistry: nodeRegistryPDA,
              authority: authority.publicKey,
            })
            .rpc();
        } catch (e) {
          // Ignore error if node already added
        }
      }
  
      // Create a feed to publish to
      [feedAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("feed"), authority.publicKey.toBuffer(), Buffer.from(feedId)],
        molphaProgram.programId
      );

      [subscriptionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("subscription"), authority.publicKey.toBuffer(), feedAccountPDA.toBuffer()],
        molphaProgram.programId
      );
  
      const params = {
        feedId,
        feedType: { personal: {} },
        minSignaturesThreshold: minSignatures,
        frequency: new anchor.BN(60),
        ipfsCid: "some_cid",
      };
  
      try {
        await molphaProgram.methods
          .createFeed(params)
          .accounts({
            feedAccount: feedAccountPDA,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (e) {
        // Ignore error if already created
      }

      try {
        await molphaProgram.methods
          .subscribe()
          .accounts({
            subscriptionAccount: subscriptionPDA,
            feedAccount: feedAccountPDA,
            consumer: authority.publicKey,
            payer: authority.publicKey,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (e) {
        // Ignore error if already subscribed
      }

      try {
        await molphaProgram.methods
          .topUp(new anchor.BN(100000))
          .accounts({
            subscriptionAccount: subscriptionPDA,
            owner: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (e) {
        // Ignore error if already topped up
      }
    });

    it("Successfully verifies signatures and publishes answer", async () => {
      const transaction = new Transaction();
      const signers = [nodes[0], nodes[1]];

      for (const signer of signers) {
        const signature = nacl.sign.detached(message, signer.secretKey);
        const ix = anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: signer.publicKey.toBytes(),
          message,
          signature,
        });
        transaction.add(ix);
      }

      const answer = {
        value: Array.from(Buffer.from("0".repeat(32))),
        timestamp: new anchor.BN(Math.floor(Date.now() / 1000) - 5),
      };

      transaction.add(
        await molphaProgram.methods
          .verifySignatures(message, minSignatures, answer)
          .accounts({
            nodeRegistry: nodeRegistryPDA,
            feedAccount: feedAccountPDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            protocolConfig: protocolConfigPDA,
            subscriptionAccount: subscriptionPDA,
          })
          .instruction()
      );

      await sendAndConfirmTransaction(provider.connection, transaction, [
        authority.payer,
      ]);

      // Verify the data was published
      const feedAccountData = await molphaProgram.account.feedAccount.fetch(feedAccountPDA);
      assert.deepEqual(feedAccountData.latestAnswer.value, answer.value);
      assert.ok(feedAccountData.latestAnswer.timestamp.eq(answer.timestamp));
    });
  });
});
