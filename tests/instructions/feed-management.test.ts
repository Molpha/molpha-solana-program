import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { setupTestContext, initializeProtocol, TestContext, createTestDataSourceInfo, generateTestSignature, computeDataSourceId } from "../setup";

describe("Feed Management Instructions", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);
  });

  it("Creates a new public feed", async () => {
    // Generate test data and signature
    const testDataSource = {
      dataSourceType: 1, // Private
      source: "https://finnhub.io/api/v1/quote",
      name: "Apple Stock Price 2",
    };

    // Generate a keypair and sign the data
    const { signature, address } = generateTestSignature(
      testDataSource.dataSourceType,
      testDataSource.source,
      testDataSource.name
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: testDataSource.dataSourceType,
      ownerEth: address,
      name: testDataSource.name,
      source: testDataSource.source,
    });

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSource.dataSourceType,
      testDataSource.source,
      address, // Use the generated address
      testDataSource.name,
      signature // Use the generated signature
    );

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    // Create the data source
    await ctx.molphaProgram.methods
      .createDataSource(dataSourceInfo)
      .accounts({
        payer: ctx.authority.publicKey,
        dataSource: dataSourcePDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Now create the feed linked to this data source
    const feedId = "public-feed-for-create";
    const [feedAccountPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedId.padEnd(32, "\0")),
      ],
      ctx.molphaProgram.programId
    );
    const feedParams = {
      feedId: Array.from(Buffer.from(feedId.padEnd(32, "\0"))),
      feedType: { personal: {} }, // Change to personal since we're using private data source
      minSignaturesThreshold: 1,
      frequency: new anchor.BN(60),
      ipfsCid: "cid",
      dataSourceId: Array.from(dataSourceId),
    };

    // For private data sources, we need an EthLink
    const ownerEthBytes = Array.from(Buffer.from(address.slice(2), "hex"));
    const granteeBytes = Array.from(ctx.authority.publicKey.toBuffer());
    
    const [ethLinkPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("eth_link"), Buffer.from(ownerEthBytes), Buffer.from(granteeBytes)],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .createFeed(feedParams, dataSourceInfo)
      .accounts({
        feedAccount: feedAccountPDA,
        dataSource: dataSourcePDA,
        ethLinkPda: ethLinkPDA,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const feedAccount = await ctx.molphaProgram.account.feedAccount.fetch(
      feedAccountPDA
    );
    assert.ok(feedAccount.authority.equals(ctx.authority.publicKey));
    assert.deepEqual(feedAccount.feedType, { personal: {} }); // Updated to match
    assert.equal(feedAccount.minSignaturesThreshold, 1);
    assert.equal(feedAccount.frequency.toNumber(), 60);
    assert.equal(feedAccount.ipfsCid, "cid");
    assert.deepEqual(feedAccount.dataSourceId, Array.from(dataSourceId));
  });

  it("Updates a personal feed's config", async () => {
    const personalFeedId = "personal-feed-for-update";
    const [personalFeedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(personalFeedId.padEnd(32, "\0")),
      ],
      ctx.molphaProgram.programId
    );

    // Generate test data and signature
    const testDataSource = {
      dataSourceType: 1, // Private
      source: "https://finnhub.io/api/v1/quote",
      name: "Apple Stock Price Update Test",
    };

    // Generate a keypair and sign the data
    const { signature, address } = generateTestSignature(
      testDataSource.dataSourceType,
      testDataSource.source,
      testDataSource.name
    );

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSource.dataSourceType,
      testDataSource.source,
      address, // Use the generated address
      testDataSource.name,
      signature // Use the generated signature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: testDataSource.dataSourceType,
      ownerEth: address,
      name: testDataSource.name,
      source: testDataSource.source,
    });

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    // For private data sources, we need an EthLink
    const ownerEthBytes = Array.from(Buffer.from(address.slice(2), "hex"));
    const granteeBytes = Array.from(ctx.authority.publicKey.toBuffer());
    
    const [ethLinkPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("eth_link"), Buffer.from(ownerEthBytes), Buffer.from(granteeBytes)],
      ctx.molphaProgram.programId
    );

    const feedParams = {
      feedId: Array.from(Buffer.from(personalFeedId.padEnd(32, "\0"))),
      feedType: { personal: {} },
      minSignaturesThreshold: 1,
      frequency: new anchor.BN(30),
      ipfsCid: "personal_initial_cid",
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

    const updateParams = {
      minSignaturesThreshold: 5,
      frequency: new anchor.BN(120),
      ipfsCid: "personal_updated_cid",
    };
    await ctx.molphaProgram.methods
      .updateFeedConfig(updateParams)
      .accounts({
        feedAccount: personalFeedPDA,
        authority: ctx.authority.publicKey,
      })
      .rpc();

    const feedAccount = await ctx.molphaProgram.account.feedAccount.fetch(
      personalFeedPDA
    );
    assert.equal(feedAccount.minSignaturesThreshold, 5);
    assert.equal(feedAccount.frequency.toNumber(), 120);
    assert.equal(feedAccount.ipfsCid, "personal_updated_cid");
  });

  it("Fails to update a public feed's config", async () => {
    const feedId = "public-feed-for-fail-update";
    const [publicFeedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedId.padEnd(32, "\0")),
      ],
      ctx.molphaProgram.programId
    );

    // Generate test data and signature
    const testDataSource = {
      dataSourceType: 1, // Private
      source: "https://finnhub.io/api/v1/quote",
      name: "Apple Stock Price Fail Test",
    };

    // Generate a keypair and sign the data
    const { signature, address } = generateTestSignature(
      testDataSource.dataSourceType,
      testDataSource.source,
      testDataSource.name
    );

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSource.dataSourceType,
      testDataSource.source,
      address, // Use the generated address
      testDataSource.name,
      signature // Use the generated signature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: testDataSource.dataSourceType,
      ownerEth: address,
      name: testDataSource.name,
      source: testDataSource.source,
    });

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    // For private data sources, we need an EthLink
    const ownerEthBytes = Array.from(Buffer.from(address.slice(2), "hex"));
    const granteeBytes = Array.from(ctx.authority.publicKey.toBuffer());
    
    const [ethLinkPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("eth_link"), Buffer.from(ownerEthBytes), Buffer.from(granteeBytes)],
      ctx.molphaProgram.programId
    );

    const feedParams = {
      feedId: Array.from(Buffer.from(feedId.padEnd(32, "\0"))),
      feedType: { public: {} }, // Keep as public to test the failure case
      minSignaturesThreshold: 1,
      frequency: new anchor.BN(60),
      ipfsCid: "cid",
      dataSourceId: Array.from(dataSourceId),
    };

    await ctx.molphaProgram.methods
      .createFeed(feedParams, dataSourceInfo)
      .accounts({
        feedAccount: publicFeedPDA,
        dataSource: dataSourcePDA,
        ethLinkPda: ethLinkPDA,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const updateParams = {
      minSignaturesThreshold: 5,
      frequency: new anchor.BN(120),
      ipfsCid: "updated_cid",
    };
    try {
      await ctx.molphaProgram.methods
        .updateFeedConfig(updateParams)
        .accounts({
          feedAccount: publicFeedPDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();
      assert.fail("Should have failed to update a public feed.");
    } catch (error: any) {
      assert.equal(error.error.errorCode.code, "NotSupported");
    }
  });
});
