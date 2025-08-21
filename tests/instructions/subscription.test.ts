import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { setupTestContext, initializeProtocol, TestContext, createTestDataSourceInfo, testSignature, computeDataSourceId } from "../setup";

describe("Subscription Instructions", () => {
  let ctx: TestContext;
  const personalFeedId = "personal-feed-for-subs";
  let personalFeedPDA: PublicKey;

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);

    // Create a personal feed for subscription tests
    [personalFeedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(personalFeedId.padEnd(32, "\0")),
      ],
      ctx.molphaProgram.programId
    );
    
    try {
      // Use the same valid data source info for consistency
      const testDataSource = {
        dataSourceType: 1, // Private
        source: "https://finnhub.io/api/v1/quote",
        owner: "0xa408b7c5BC50fa392642C58B9758410ea3376a09",
        name: "Apple Stock Price 2",
      };

      const dataSourceInfo = createTestDataSourceInfo(
        testDataSource.dataSourceType,
        testDataSource.source,
        testDataSource.owner,
        testDataSource.name,
        testSignature
      );

      const dataSourceId = computeDataSourceId({
        dataSourceType: testDataSource.dataSourceType,
        ownerEth: testDataSource.owner,
        name: testDataSource.name,
        source: testDataSource.source,
      });

      const [dataSourcePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("data_source"), dataSourceId],
        ctx.molphaProgram.programId
      );

      // For private data sources, we need an EthLink
      const ownerEthBytes = Array.from(Buffer.from(testDataSource.owner.slice(2), "hex"));
      const granteeBytes = Array.from(ctx.authority.publicKey.toBuffer());
      
      const [ethLinkPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("eth_link"), Buffer.from(ownerEthBytes), Buffer.from(granteeBytes)],
        ctx.molphaProgram.programId
      );

      const feedParams = {
        feedId: Array.from(Buffer.from(personalFeedId.padEnd(32, "\0"))),
        feedType: { personal: {} },
        minSignaturesThreshold: 1,
        frequency: new anchor.BN(60),
        ipfsCid: "personal_cid",
        dataSourceId: Array.from(dataSourceId),
      };

      await ctx.molphaProgram.methods
        .createFeed(feedParams, dataSourceInfo)
        .accounts({
          feedAccount: personalFeedPDA,
          dataSource: dataSourcePDA,
          ethLinkPda: ethLinkPDA,
          authority: ctx.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Ignore error if already created
    }
  });

  it("Creates a new subscription for the feed owner", async () => {
    const [subscriptionPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("subscription"),
        ctx.authority.publicKey.toBuffer(),
        personalFeedPDA.toBuffer(),
      ],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .subscribe()
      .accounts({
        subscriptionAccount: subscriptionPDA,
        feedAccount: personalFeedPDA,
        consumer: ctx.authority.publicKey,
        payer: ctx.authority.publicKey,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const subscriptionAccount =
      await ctx.molphaProgram.account.subscriptionAccount.fetch(subscriptionPDA);
    assert.ok(subscriptionAccount.owner.equals(ctx.authority.publicKey));
    assert.equal(subscriptionAccount.balance.toNumber(), 0);
  });

  it("Tops up a subscription", async () => {
    const [subscriptionPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("subscription"),
        ctx.authority.publicKey.toBuffer(),
        personalFeedPDA.toBuffer(),
      ],
      ctx.molphaProgram.programId
    );
    const topUpAmount = new anchor.BN(100000); // 0.0001 SOL

    await ctx.molphaProgram.methods
      .topUp(topUpAmount)
      .accounts({
        subscriptionAccount: subscriptionPDA,
        owner: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const subscriptionAccount =
      await ctx.molphaProgram.account.subscriptionAccount.fetch(subscriptionPDA);
    assert.equal(
      subscriptionAccount.balance.toNumber(),
      topUpAmount.toNumber()
    );
  });
});
