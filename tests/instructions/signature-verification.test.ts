// import * as anchor from "@coral-xyz/anchor";
// import { assert } from "chai";
// import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
// import nacl from "tweetnacl";
// import { setupTestContext, initializeProtocol, TestContext, createTestDataSourceInfo, testSignature, computeDataSourceId } from "../setup";

// describe("Signature Verification and Publishing", () => {
//   let ctx: TestContext;
//   const message = Buffer.from("Test message for integrated publishing");
//   const minSignatures = 2;
//   const feedId = "test-feed-integrated";

//   let feedPDA: PublicKey;
//   let subscriptionPDA: PublicKey;

//   before(async () => {
//     ctx = await setupTestContext();
//     await initializeProtocol(ctx);

//     // Add nodes for verification
//     for (let i = 0; i < 3; i++) {
//       try {
//         await ctx.molphaProgram.methods
//           .addNode(ctx.nodes[i].publicKey)
//           .accounts({
//             nodeRegistry: ctx.nodeRegistryPDA,
//             authority: ctx.authority.publicKey,
//           })
//           .rpc();
//       } catch (e) {
//         // Ignore error if node already added
//       }
//     }

//     // Create a feed to publish to
//     [feedPDA] = PublicKey.findProgramAddressSync(
//       [
//         Buffer.from("feed"),
//         ctx.authority.publicKey.toBuffer(),
//         Buffer.from(feedId.padEnd(32, "\0")),
//       ],
//       ctx.molphaProgram.programId
//     );

//     [subscriptionPDA] = PublicKey.findProgramAddressSync(
//       [
//         Buffer.from("subscription"),
//         ctx.authority.publicKey.toBuffer(),
//         feedPDA.toBuffer(),
//       ],
//       ctx.molphaProgram.programId
//     );

//     try {
//       // Use the same valid data source info for consistency
//       const testDataSource = {
//         dataSourceType: 1, // Private
//         source: "https://finnhub.io/api/v1/quote",
//         owner: "0xa408b7c5BC50fa392642C58B9758410ea3376a09",
//         name: "Apple Stock Price 2",
//       };

//       const dataSourceInfo = createTestDataSourceInfo(
//         testDataSource.dataSourceType,
//         testDataSource.source,
//         testDataSource.owner,
//         testDataSource.name,
//         testSignature
//       );

//       const dataSourceId = computeDataSourceId({
//         dataSourceType: testDataSource.dataSourceType,
//         ownerEth: testDataSource.owner,
//         name: testDataSource.name,
//         source: testDataSource.source,
//       });

//       const [dataSourcePDA] = PublicKey.findProgramAddressSync(
//         [Buffer.from("data_source"), dataSourceId],
//         ctx.molphaProgram.programId
//       );

//       // For private data sources, we need an EthLink
//       const ownerEthBytes = Array.from(Buffer.from(testDataSource.owner.slice(2), "hex"));
//       const granteeBytes = Array.from(ctx.authority.publicKey.toBuffer());

//       const [ethLinkPDA] = PublicKey.findProgramAddressSync(
//         [Buffer.from("eth_link"), Buffer.from(ownerEthBytes), Buffer.from(granteeBytes)],
//         ctx.molphaProgram.programId
//       );

//       const params = {
//         feedId: Array.from(Buffer.from(feedId.padEnd(32, "\0"))),
//         feedType: { personal: {} },
//         minSignaturesThreshold: minSignatures,
//         frequency: new anchor.BN(60),
//         ipfsCid: "some_cid",
//         dataSourceId: Array.from(dataSourceId),
//       };

//       await ctx.molphaProgram.methods
//         .createFeed(params, dataSourceInfo)
//         .accounts({
//           feed: feedPDA,
//           dataSource: dataSourcePDA,
//           ethLinkPda: ethLinkPDA,
//           authority: ctx.authority.publicKey,
//           systemProgram: SystemProgram.programId,
//         })
//         .rpc();
//     } catch (e) {
//       // Ignore error if already created
//     }

//     try {
//       await ctx.molphaProgram.methods
//         .subscribe()
//         .accounts({
//           subscriptionAccount: subscriptionPDA,
//           feed: feedPDA,
//           consumer: ctx.authority.publicKey,
//           payer: ctx.authority.publicKey,
//           authority: ctx.authority.publicKey,
//           systemProgram: SystemProgram.programId,
//         })
//         .rpc();
//     } catch (e) {
//       // Ignore error if already subscribed
//     }

//     try {
//       await ctx.molphaProgram.methods
//         .topUp(new anchor.BN(100000))
//         .accounts({
//           subscriptionAccount: subscriptionPDA,
//           owner: ctx.authority.publicKey,
//           systemProgram: SystemProgram.programId,
//         })
//         .rpc();
//     } catch (e) {
//       // Ignore error if already topped up
//     }

//     // Add nodes to the feed for signature verification
//     for (let i = 0; i < 3; i++) {
//       try {
//         // Note: This method might not exist in the current program
//         // The test will fail gracefully if the method doesn't exist
//         await ctx.molphaProgram.methods
//           .addNodeToFeed(ctx.nodes[i].publicKey)
//           .accounts({
//             feed: feedPDA,
//             authority: ctx.authority.publicKey,
//           })
//           .rpc();
//       } catch (e) {
//         // Ignore error if method doesn't exist or node already added
//       }
//     }
//   });

//   it("Successfully verifies signatures and publishes answer", async () => {
//     const transaction = new Transaction();
//     const signers = [ctx.nodes[0], ctx.nodes[1]];

//     for (const signer of signers) {
//       const signature = nacl.sign.detached(message, signer.secretKey);
//       const ix = anchor.web3.Ed25519Program.createInstructionWithPublicKey({
//         publicKey: signer.publicKey.toBytes(),
//         message,
//         signature,
//       });
//       transaction.add(ix);
//     }

//     const answer = {
//       value: Array.from(Buffer.from("0".repeat(32))),
//       timestamp: new anchor.BN(Math.floor(Date.now() / 1000) - 5),
//     };

//     transaction.add(
//       await ctx.molphaProgram.methods
//         .verifySignatures(message, minSignatures, answer)
//         .accounts({
//           nodeRegistry: ctx.nodeRegistryPDA,
//           feed: feedPDA,
//           instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
//           protocolConfig: ctx.protocolConfigPDA,
//           subscriptionAccount: subscriptionPDA,
//         })
//         .instruction()
//     );

//     await ctx.provider.sendAndConfirm(transaction, [ctx.authority.payer]);

//     // Verify the data was published
//     const feedData = await ctx.molphaProgram.account.feed.fetch(
//       feedPDA
//     );
//     assert.deepEqual(feedData.latestAnswer.value, answer.value);
//     assert.ok(feedData.latestAnswer.timestamp.eq(answer.timestamp));
//   });
// });
