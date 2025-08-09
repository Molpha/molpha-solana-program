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
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import { ethers } from "ethers";
const secp256k1 = require("@noble/secp256k1");

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

  describe("Data Source Creation", () => {
    // Test data from EVM contract tests - exact match
    const testDataSource = {
      dataSourceType: 1, // Private
      source: "https://finnhub.io/api/v1/quote",
      owner: "0xa408b7c5BC50fa392642C58B9758410ea3376a09", // Original owner from EVM tests
      name: "Apple Stock Price 2"
    };

    const testSignature = "0xb8b5718dedd6ba74f754a35ec92064a30443559e7f8b2e5d2b43f3b56147014d4c328a3a482feaebd969bd501975a81676feea6ca313bfebea18fff4f3d1e9e51c";

    // Helper functions for EIP-712 and secp256k1
    function buildEIP712Domain(name: string, version: string) {
      // Use hardcoded DOMAIN_SEPARATOR from DataSourceRegistry.sol
      // bytes32 private constant DOMAIN_SEPARATOR = 0x91af22df910089dce34bc41d0790bb4a1beee77dda588667c082bb964143739f;
      return Buffer.from([
        0x91, 0xaf, 0x22, 0xdf, 0x91, 0x00, 0x89, 0xdc, 0xe3, 0x4b, 0xc4, 0x1d, 0x07, 0x90, 0xbb, 0x4a,
        0x1b, 0xee, 0xe7, 0x7d, 0xda, 0x58, 0x86, 0x67, 0xc0, 0x82, 0xbb, 0x96, 0x41, 0x43, 0x73, 0x9f
      ]);
    }

    function buildDataSourceStructHash(data: any) {
      const typeHash = Buffer.from(
        ethers.keccak256(Buffer.from("DataSource(uint8 type,string source,address owner,string name)")).slice(2),
        'hex'
      );
      
      const sourceHash = Buffer.from(ethers.keccak256(Buffer.from(data.source)).slice(2), 'hex');
      const nameHash = Buffer.from(ethers.keccak256(Buffer.from(data.name)).slice(2), 'hex');
      
      // Pad owner address to 32 bytes
      const ownerEthPadded = Buffer.alloc(32);
      Buffer.from(data.owner.slice(2), 'hex').copy(ownerEthPadded, 12);
      
      // Pad dataSourceType to 32 bytes
      const dataSourceTypeBytes = Buffer.alloc(32);
      dataSourceTypeBytes[31] = data.dataSourceType;
      
      // Match Solidity parameter order: (type, source, owner, name)
      return Buffer.from(ethers.keccak256(Buffer.concat([
        typeHash,
        dataSourceTypeBytes,
        sourceHash,
        ownerEthPadded,
        nameHash,
      ])).slice(2), 'hex');
    }

    function buildEIP712Digest(domainSeparator: Uint8Array, structHash: Uint8Array) {
      return Buffer.from(ethers.keccak256(Buffer.concat([
        Buffer.from("\x19\x01"),
        domainSeparator,
        structHash,
      ])).slice(2), 'hex');
    }

    function computeDataSourceId(data: any) {
      const serialized = Buffer.concat([
        Buffer.from([data.dataSourceType]),
        Buffer.from(data.source || ""),
        Buffer.from(data.ownerEth.slice(2), 'hex'),
        Buffer.from(data.name),
      ]);
      return Buffer.from(ethers.keccak256(serialized).slice(2), 'hex');
    }

    async function createSecp256k1Instruction(digest: Uint8Array, signature: string, recoveryId: number) {
      // Parse signature (remove 0x prefix and recovery ID suffix)
      const sigBytes = Buffer.from(signature.slice(2, -2), 'hex');
      const r = sigBytes.slice(0, 32);
      const s = sigBytes.slice(32, 64);
      
      // Recover public key
      const sig = secp256k1.Signature.fromCompact(sigBytes.slice(0, 64)).addRecoveryBit(recoveryId);
      const publicKey = sig.recoverPublicKey(digest);
      const publicKeyBytes = publicKey.toRawBytes(false).slice(1); // Remove 0x04 prefix
      
      // Use Solana's secp256k1 instruction format (16-byte header + data)
      const signatureOffset = 16;
      const publicKeyOffset = signatureOffset + 65; // 64 bytes signature + 1 byte recovery
      const messageDataOffset = publicKeyOffset + 64;
      const messageDataSize = 32;
      
      const instructionData = Buffer.alloc(16 + 65 + 64 + 32);
      let offset = 0;
      
      // Header (16 bytes) - matches Ed25519 format but for secp256k1
      instructionData[offset++] = 1; // num_signatures
      instructionData[offset++] = 0; // padding
      instructionData.writeUInt16LE(signatureOffset, offset); offset += 2; // signature_offset
      instructionData.writeUInt16LE(0, offset); offset += 2; // signature_instruction_index
      instructionData.writeUInt16LE(publicKeyOffset, offset); offset += 2; // public_key_offset
      instructionData.writeUInt16LE(0, offset); offset += 2; // public_key_instruction_index
      instructionData.writeUInt16LE(messageDataOffset, offset); offset += 2; // message_data_offset
      instructionData.writeUInt16LE(messageDataSize, offset); offset += 2; // message_data_size
      instructionData.writeUInt16LE(0, offset); offset += 2; // message_instruction_index
      
      // Signature data (65 bytes: r + s + recovery_id)
      r.copy(instructionData, signatureOffset);
      s.copy(instructionData, signatureOffset + 32);
      instructionData[signatureOffset + 64] = recoveryId;
      
      // Public key (64 bytes)
      Buffer.from(publicKeyBytes).copy(instructionData, publicKeyOffset);
      
      // Message hash (32 bytes)
      Buffer.from(digest).copy(instructionData, messageDataOffset);
      
      return {
        programId: new PublicKey("KeccakSecp256k11111111111111111111111111111"),
        keys: [],
        data: instructionData,
      };
    }

    it("Successfully creates a data source with valid EIP-712 signature", async () => {
      // Show what the test data looks like - using DataSourceInit structure
      const dataSourceInit = {
        dataSourceType: testDataSource.dataSourceType === 1 ? { private: {} } : { public: {} },  // First field
        source: testDataSource.source,                                                            // Second field
        ownerEth: Array.from(Buffer.from(testDataSource.owner.slice(2), 'hex')),                 // Third field
        name: testDataSource.name,                                                                // Fourth field
      };

      console.log("dataSourceInit.ownerEth", dataSourceInit.ownerEth);
      console.log("dataSourceInit.dataSourceType", dataSourceInit.dataSourceType);
      console.log("dataSourceInit.name", dataSourceInit.name);
      console.log("dataSourceInit.source", dataSourceInit.source);

      // Compute EIP-712 digest - MUST match what the program computes
      const domainSeparator = buildEIP712Domain("Molpha Oracles", "1"); // Match program's domain
      const structHash = buildDataSourceStructHash({
        owner: testDataSource.owner, // Use 'owner' instead of 'ownerEth'
        dataSourceType: testDataSource.dataSourceType,
        name: testDataSource.name,
        source: testDataSource.source,
      });
      const digest = buildEIP712Digest(domainSeparator, structHash);

      console.log("EIP-712 digest:", Buffer.from(digest).toString('hex'));

      // Compute data source ID 
      const dataSourceId = computeDataSourceId({
        dataSourceType: testDataSource.dataSourceType,
        ownerEth: testDataSource.owner,
        name: testDataSource.name,
        source: testDataSource.source,
      });

      console.log("Data source ID:", Buffer.from(dataSourceId).toString('hex'));

      const [dataSourcePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("data_source"), dataSourceId],
        molphaProgram.programId
      );

      console.log("Data source PDA:", dataSourcePDA.toString());

      // Send transaction using syscall approach (no secp256k1 instruction needed)
      // Extract recovery ID and convert from Ethereum format (27/28) to Solana format (0/1)
      const recoveryId = parseInt(testSignature.slice(-2), 16) - 27;
      const sigWithoutRecoveryId = Buffer.from(testSignature.slice(2, -2), 'hex'); // r,s without recovery ID
      const sigWithSolanaRecoveryId = Buffer.concat([sigWithoutRecoveryId, Buffer.from([recoveryId])]);
      const sig = Array.from(sigWithSolanaRecoveryId);
      
      try {
        await molphaProgram.methods
          .createDataSource(dataSourceInit, sig, 0) // secp_ix_index not used in syscall approach
          .accounts({
            payer: authority.publicKey,
            dataSourcePda: dataSourcePDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (error: any) {
        console.log("Full error:", error);
        if (error.logs) {
          console.log("Transaction logs:", error.logs);
        }
        throw error;
      }

      const dataSourceAccount = await molphaProgram.account.dataSource.fetch(dataSourcePDA);
      console.log("Created data source:", dataSourceAccount);
      
      // Verify the account was created correctly
      assert.deepEqual(dataSourceAccount.ownerEth, Array.from(Buffer.from(testDataSource.owner.slice(2), 'hex')));
      assert.equal(dataSourceAccount.isPublic, testDataSource.dataSourceType === 0);
    });

    it("Fails to create data source with invalid signature", async () => {
      const dataSourceInit = {
        dataSourceType: { private: {} },
        source: "https://example.com",
        ownerEth: Array.from(Buffer.from(testDataSource.owner.slice(2), 'hex')),
        name: "Invalid Test Data Source",
      };

      // Use different data for digest (should cause signature verification to fail)
      const domainSeparator = buildEIP712Domain("MolphaDataSource", "1");
      const structHash = buildDataSourceStructHash({
        owner: testDataSource.owner, // Use 'owner' instead of 'ownerEth'
        dataSourceType: testDataSource.dataSourceType,
        name: "Different Name", // Different from what we're trying to create
        source: "https://example.com",
      });
      const digest = buildEIP712Digest(domainSeparator, structHash);

      const dataSourceId = computeDataSourceId({
        ownerEth: testDataSource.owner,
        dataSourceType: testDataSource.dataSourceType,
        name: "Invalid Test Data Source",
        source: "https://example.com",
      });

      const [dataSourcePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("data_source"), dataSourceId],
        molphaProgram.programId
      );

      // Extract recovery ID and convert from Ethereum format (27/28) to Solana format (0/1)
      const recoveryId = parseInt(testSignature.slice(-2), 16) - 27;
      const sigWithoutRecoveryId = Buffer.from(testSignature.slice(2, -2), 'hex'); // r,s without recovery ID
      const sigWithSolanaRecoveryId = Buffer.concat([sigWithoutRecoveryId, Buffer.from([recoveryId])]);
      const sig = Array.from(sigWithSolanaRecoveryId);
      
      try {
        await molphaProgram.methods
          .createDataSource(dataSourceInit, sig, 0)
          .accounts({
            payer: authority.publicKey,
            dataSourcePda: dataSourcePDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have failed with digest mismatch");
      } catch (error: any) {
        console.log("Expected error:", error.message);
        assert.ok(
          error.message.includes("DigestMismatch") || 
          error.message.includes("InvalidEthereumAddress") ||
          error.message.includes("RecoveredAddressMismatch") ||
          error.message.includes("custom program error")
        );
      }
    });

    it("Fails to create data source with wrong owner address", async () => {
      const wrongOwner = "0x1234567890123456789012345678901234567890";
      const dataSourceInit = {
        dataSourceType: { private: {} },
        source: "https://example.com",
        ownerEth: Array.from(Buffer.from(wrongOwner.slice(2), 'hex')),
        name: "Wrong Owner Test",
      };

      // Create correct digest but with wrong owner in data
      const domainSeparator = buildEIP712Domain("MolphaDataSource", "1");
      const structHash = buildDataSourceStructHash({
        owner: testDataSource.owner, // Correct owner for signature
        dataSourceType: testDataSource.dataSourceType,
        name: "Wrong Owner Test",
        source: "https://example.com",
      });
      const digest = buildEIP712Digest(domainSeparator, structHash);

      const dataSourceId = computeDataSourceId({
        ownerEth: wrongOwner,
        dataSourceType: testDataSource.dataSourceType,
        name: "Wrong Owner Test",
        source: "https://example.com",
      });

      const [dataSourcePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("data_source"), dataSourceId],
        molphaProgram.programId
      );

      // Extract recovery ID and convert from Ethereum format (27/28) to Solana format (0/1)
      const recoveryId = parseInt(testSignature.slice(-2), 16) - 27;
      const sigWithoutRecoveryId = Buffer.from(testSignature.slice(2, -2), 'hex'); // r,s without recovery ID
      const sigWithSolanaRecoveryId = Buffer.concat([sigWithoutRecoveryId, Buffer.from([recoveryId])]);
      const sig = Array.from(sigWithSolanaRecoveryId);
      
      try {
        await molphaProgram.methods
          .createDataSource(dataSourceInit, sig, 0)
          .accounts({
            payer: authority.publicKey,
            dataSourcePda: dataSourcePDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have failed with invalid Ethereum address");
      } catch (error: any) {
        console.log("Expected error:", error.message);
        assert.ok(
          error.message.includes("InvalidEthereumAddress") ||
          error.message.includes("RecoveredAddressMismatch") ||
          error.message.includes("custom program error")
        );
      }
    });

    it("Fails to create duplicate data source", async () => {
      // Try to create the same data source again (should fail)
      const dataSourceInit = {
        dataSourceType: testDataSource.dataSourceType === 1 ? { private: {} } : { public: {} },
        source: testDataSource.source,
        ownerEth: Array.from(Buffer.from(testDataSource.owner.slice(2), 'hex')),
        name: testDataSource.name,
      };

      const domainSeparator = buildEIP712Domain("MolphaDataSource", "1");
      const structHash = buildDataSourceStructHash({
        owner: testDataSource.owner, // Use 'owner' instead of 'ownerEth'
        dataSourceType: testDataSource.dataSourceType,
        name: testDataSource.name,
        source: testDataSource.source,
      });
      const digest = buildEIP712Digest(domainSeparator, structHash);

      const dataSourceId = computeDataSourceId({
        ownerEth: testDataSource.owner,
        dataSourceType: testDataSource.dataSourceType,
        name: testDataSource.name,
        source: testDataSource.source,
      });

      const [dataSourcePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("data_source"), dataSourceId],
        molphaProgram.programId
      );

      const transaction = new Transaction();
      const secp256k1Ix = await createSecp256k1Instruction(digest, testSignature, 1); // Use working recovery ID
      transaction.add(secp256k1Ix);

      // Extract recovery ID and convert from Ethereum format (27/28) to Solana format (0/1)
      const recoveryId = parseInt(testSignature.slice(-2), 16) - 27;
      const sigWithoutRecoveryId = Buffer.from(testSignature.slice(2, -2), 'hex'); // r,s without recovery ID
      const sigWithSolanaRecoveryId = Buffer.concat([sigWithoutRecoveryId, Buffer.from([recoveryId])]);
      const sig = Array.from(sigWithSolanaRecoveryId);
      const createDataSourceIx = await molphaProgram.methods
        .createDataSource(dataSourceInit, sig, 0)
        .accounts({
          payer: authority.publicKey,
          dataSourcePda: dataSourcePDA,
          systemProgram: SystemProgram.programId,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction();

      transaction.add(createDataSourceIx);

      try {
        await sendAndConfirmTransaction(provider.connection, transaction, [authority.payer]);
        assert.fail("Should have failed with data source already exists");
      } catch (error: any) {
        console.log("Expected error:", error.message);
        assert.ok(
          error.message.includes("DataSourceAlreadyExists") || 
          error.message.includes("already in use") ||
          error.message.includes("custom program error")
        );
      }
    });
  });
});
