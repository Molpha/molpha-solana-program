#!/usr/bin/env node

const anchor = require('@coral-xyz/anchor');
const { SystemProgram } = require('@solana/web3.js');

async function main() {
  if (!process.argv[2]) {
    console.error('❌ Error: Feed ID is required');
    console.log('Usage: node subscribe.js <FEED_ID> [CONSUMER_PUBKEY]');
    console.log('  CONSUMER_PUBKEY: consumer public key (default: wallet public key)');
    process.exit(1);
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.MolphaFeed;
  
  // Parse command line arguments
  const feedId = process.argv[2];
  const consumer = (process.argv[3] && process.argv[3].trim() !== '') 
    ? new anchor.web3.PublicKey(process.argv[3]) 
    : provider.wallet.publicKey;
  
  const [feedAccountPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('feed'), provider.wallet.publicKey.toBuffer(), Buffer.from(feedId)],
    program.programId
  );
  
  const [subscriptionPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('subscription'), consumer.toBuffer(), feedAccountPDA.toBuffer()],
    program.programId
  );
  
  try {
    const txSignature = await program.methods.subscribe().accounts({
      subscriptionAccount: subscriptionPDA,
      feedAccount: feedAccountPDA,
      consumer: consumer,
      payer: provider.wallet.publicKey,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    }).rpc();
    
    console.log('✅ Subscription created successfully!');
    console.log('Feed ID:', feedId);
    console.log('Consumer:', consumer.toString());
    console.log('Subscription PDA:', subscriptionPDA.toString());
    console.log('Transaction signature:', txSignature);
  } catch (e) {
    console.error('❌ Error creating subscription:', e.message);
    process.exit(1);
  }
}

main().catch(console.error); 