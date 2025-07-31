#!/usr/bin/env node

const anchor = require('@coral-xyz/anchor');
const { SystemProgram } = require('@solana/web3.js');

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.MolphaSolana;
  const [nodeRegistryPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('node-registry')],
    program.programId
  );
  
  try {
    const txSignature = await program.methods.initialize().accounts({
      nodeRegistry: nodeRegistryPDA,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    }).rpc();
    
    console.log('✅ NodeRegistry initialized successfully!');
    console.log('NodeRegistry PDA:', nodeRegistryPDA.toString());
    console.log('Transaction signature:', txSignature);
  } catch (e) {
    console.error('❌ Error initializing NodeRegistry:', e.message);
    process.exit(1);
  }
}

main().catch(console.error); 