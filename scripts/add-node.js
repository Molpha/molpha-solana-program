#!/usr/bin/env node

const anchor = require('@coral-xyz/anchor');

async function main() {
  if (!process.argv[2]) {
    console.error('❌ Error: Node public key is required');
    console.log('Usage: node add-node.js <NODE_PUBKEY>');
    process.exit(1);
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.MolphaSolana;
  const [nodeRegistryPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('node-registry')],
    program.programId
  );
  
  try {
    const nodePubkey = new anchor.web3.PublicKey(process.argv[2]);
    
    const txSignature = await program.methods.addNode(nodePubkey).accounts({
      nodeRegistry: nodeRegistryPDA,
      authority: provider.wallet.publicKey,
    }).rpc();
    
    console.log('✅ Node added successfully!');
    console.log('Node pubkey:', nodePubkey.toString());
    console.log('Transaction signature:', txSignature);
  } catch (e) {
    console.error('❌ Error adding node:', e.message);
    process.exit(1);
  }
}

main().catch(console.error); 