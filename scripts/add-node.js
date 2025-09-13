#!/usr/bin/env node

const anchor = require("@coral-xyz/anchor");

async function main() {
  if (!process.argv[2]) {
    console.error("❌ Error: Node public key is required");
    console.log("Usage: node add-node.js <NODE_PUBKEY>");
    console.log("Example: node add-node.js 11111111111111111111111111111112");
    process.exit(1);
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Molpha;
  
  // Derive the node registry PDA
  const [nodeRegistryPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("node-registry")],
    program.programId
  );

  try {
    const nodePubkey = new anchor.web3.PublicKey(process.argv[2]);
    
    // Derive the node PDA
    const [nodePDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("node"), nodePubkey.toBuffer()],
      program.programId
    );

    console.log("🔍 Adding node with the following details:");
    console.log("Node pubkey:", nodePubkey.toString());
    console.log("Node PDA:", nodePDA.toString());
    console.log("Node Registry PDA:", nodeRegistryPDA.toString());
    console.log("Authority:", provider.wallet.publicKey.toString());
    console.log("");

    // Check if node registry exists
    try {
      const nodeRegistryAccount = await program.account.nodeRegistry.fetch(nodeRegistryPDA);
      console.log(`📋 Current nodes in registry: ${nodeRegistryAccount.nodes.length}`);
    } catch (e) {
      console.error("❌ Error: Node registry not found. Please run initialize script first.");
      process.exit(1);
    }

    // Check if node already exists
    try {
      await program.account.node.fetch(nodePDA);
      console.error("❌ Error: Node already exists");
      process.exit(1);
    } catch (e) {
      // Node doesn't exist, which is good for adding
    }

    const txSignature = await program.methods
      .addNode(nodePubkey)
      .accounts({
        nodeRegistry: nodeRegistryPDA,
        node: nodePDA,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Node added successfully!");
    console.log("Node pubkey:", nodePubkey.toString());
    console.log("Node PDA:", nodePDA.toString());
    console.log("Transaction signature:", txSignature);
    
    // Verify the node was added
    try {
      const nodeAccount = await program.account.node.fetch(nodePDA);
      const nodeRegistryAccount = await program.account.nodeRegistry.fetch(nodeRegistryPDA);
      
      console.log("");
      console.log("📊 Node Details:");
      console.log("- Authority:", nodeAccount.authority.toString());
      console.log("- Node Pubkey:", nodeAccount.nodePubkey.toString());
      console.log("- Is Active:", nodeAccount.isActive);
      console.log("- Created At:", new Date(nodeAccount.createdAt.toNumber() * 1000).toISOString());
      console.log("- Last Active:", new Date(nodeAccount.lastActive.toNumber() * 1000).toISOString());
      console.log("");
      console.log(`📋 Total nodes in registry: ${nodeRegistryAccount.nodes.length}`);
      
    } catch (e) {
      console.warn("⚠️  Warning: Could not fetch node details for verification:", e.message);
    }
    
  } catch (e) {
    console.error("❌ Error adding node:", e.message);
    if (e.logs) {
      console.error("Transaction logs:", e.logs);
    }
    process.exit(1);
  }
}

main().catch(console.error);
