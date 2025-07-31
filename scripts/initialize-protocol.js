#!/usr/bin/env node

const anchor = require('@coral-xyz/anchor');
const { SystemProgram } = require('@solana/web3.js');

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.MolphaFeed;
  const [protocolConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId
  );
  
  // Get fee from command line argument or use default
  const fee = process.argv[2] ? parseInt(process.argv[2]) : 1000;
  
  try {
    const txSignature = await program.methods.initializeProtocol(new anchor.BN(fee)).accounts({
      protocolConfig: protocolConfigPDA,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    }).rpc();
    
    console.log('✅ ProtocolConfig initialized successfully!');
    console.log('ProtocolConfig PDA:', protocolConfigPDA.toString());
    console.log('Protocol fee set to:', fee, 'lamports');
    console.log('Transaction signature:', txSignature);
  } catch (e) {
    console.error('❌ Error initializing ProtocolConfig:', e.message);
    process.exit(1);
  }
}

main().catch(console.error); 