#!/usr/bin/env node

const anchor = require('@coral-xyz/anchor');
const { SystemProgram } = require('@solana/web3.js');

async function main() {
  if (!process.argv[2]) {
    console.error('❌ Error: Feed ID is required');
    console.log('Usage: node create-feed.js <FEED_ID> [TYPE] [MIN_SIGS] [FREQUENCY] [IPFS_CID]');
    console.log('  TYPE: "personal" or "public" (default: public)');
    console.log('  MIN_SIGS: minimum signatures threshold (default: 1)');
    console.log('  FREQUENCY: update frequency in seconds (default: 60)');
    console.log('  IPFS_CID: IPFS content identifier (default: QmTestCid)');
    process.exit(1);
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.MolphaFeed;
  
  // Parse command line arguments
  const feedId = process.argv[2];
  const feedType = process.argv[3] === 'personal' ? { personal: {} } : { public: {} };
  const minSigs = parseInt(process.argv[4]) || 1;
  const frequency = parseInt(process.argv[5]) || 60;
  const ipfsCid = process.argv[6] || 'QmTestCid';
  
  const [feedAccountPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('feed'), provider.wallet.publicKey.toBuffer(), Buffer.from(feedId)],
    program.programId
  );
  
  try {
    const txSignature = await program.methods.createFeed({
      feedId,
      feedType,
      minSignaturesThreshold: minSigs,
      frequency: new anchor.BN(frequency),
      ipfsCid,
    }).accounts({
      feedAccount: feedAccountPDA,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    }).rpc();
    
    console.log('✅ Feed created successfully!');
    console.log('Feed ID:', feedId);
    console.log('Feed type:', process.argv[3] === 'personal' ? 'personal' : 'public');
    console.log('Feed PDA:', feedAccountPDA.toString());
    console.log('Min signatures:', minSigs);
    console.log('Frequency:', frequency, 'seconds');
    console.log('IPFS CID:', ipfsCid);
    console.log('Transaction signature:', txSignature);
  } catch (e) {
    console.error('❌ Error creating feed:', e.message);
    process.exit(1);
  }
}

main().catch(console.error); 