import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MolphaSolana } from "../target/types/molpha_solana";
import { MolphaFeed } from "../target/types/molpha_feed";
import { assert } from "chai";
import {
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} from "@solana/web3.js";
import nacl from "tweetnacl";

describe("molpha-solana", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const nodeRegistryProgram = anchor.workspace.MolphaSolana as Program<MolphaSolana>;
  const feedProgram = anchor.workspace.MolphaFeed as Program<MolphaFeed>;
  const authority = provider.wallet as anchor.Wallet;

  const [nodeRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("node-registry")],
    nodeRegistryProgram.programId
  );
  
  const nodes: Keypair[] = [];
  const MAX_NODES = 5;

  before(async () => {
    for (let i = 0; i < MAX_NODES; i++) {
      nodes.push(Keypair.generate());
    }
  });

  it("Initializes the node registry PDA", async () => {
    try {
        await nodeRegistryProgram.methods
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

    const registryAccount = await nodeRegistryProgram.account.nodeRegistry.fetch(
      nodeRegistryPDA
    );
    assert.ok(registryAccount.authority.equals(authority.publicKey));
    assert.equal(registryAccount.nodes.length, 0);
  });

  it("Adds a node", async () => {
    const nodeToAdd = nodes[0];
    await nodeRegistryProgram.methods
      .addNode(nodeToAdd.publicKey)
      .accounts({
        nodeRegistry: nodeRegistryPDA,
        authority: authority.publicKey,
      })
      .rpc();

    const registryAccount = await nodeRegistryProgram.account.nodeRegistry.fetch(
      nodeRegistryPDA
    );
    assert.equal(registryAccount.nodes.length, 1);
    assert.ok(registryAccount.nodes[0].equals(nodeToAdd.publicKey));
  });

  it("Fails to add a duplicate node", async () => {
    const nodeToAdd = nodes[0];
    try {
      await nodeRegistryProgram.methods
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
    await nodeRegistryProgram.methods
      .removeNode(nodeToRemove.publicKey)
      .accounts({
        nodeRegistry: nodeRegistryPDA,
        authority: authority.publicKey,
      })
      .rpc();

    const registryAccount = await nodeRegistryProgram.account.nodeRegistry.fetch(
      nodeRegistryPDA
    );
    assert.equal(registryAccount.nodes.length, 0);
  });

  describe("CPI Signature Verification and Publishing", () => {
    const message = Buffer.from("Test message for CPI");
    const minSignatures = 2;
    const feedId = "test-feed-cpi";
    
    let feedAccountPDA: PublicKey;
    let subscriptionPDA: PublicKey;
    let protocolConfigPDA: PublicKey;


    before(async () => {
        // Add nodes for verification
        for (let i = 0; i < 3; i++) {
            try {
                await nodeRegistryProgram.methods
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
            feedProgram.programId
        );

        [subscriptionPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("subscription"), authority.publicKey.toBuffer(), feedAccountPDA.toBuffer()],
            feedProgram.programId
        );

        [protocolConfigPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            feedProgram.programId
        );
    
        const params = {
            feedId,
            feedType: { personal: {} },
            minSignaturesThreshold: minSignatures,
            frequency: new anchor.BN(60),
            ipfsCid: "some_cid",
        };
    
        try {
            await feedProgram.methods
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
            await feedProgram.methods
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
            await feedProgram.methods
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

    it("Successfully verifies signatures and publishes answer via CPI", async () => {
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
        await nodeRegistryProgram.methods
          .verifySignatures(message, minSignatures, answer)
          .accounts({
            nodeRegistry: nodeRegistryPDA,
            feedAccount: feedAccountPDA,
            feedProgram: feedProgram.programId,
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
      const feedAccountData = await feedProgram.account.feedAccount.fetch(feedAccountPDA);
      assert.deepEqual(feedAccountData.latestAnswer.value, answer.value);
      assert.ok(feedAccountData.latestAnswer.timestamp.eq(answer.timestamp));
    });
  });
});
