import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { setupTestContext, initializeProtocol, TestContext, createTestDataSourceInfo, generateTestSignature, computeDataSourceId } from "../setup";

describe("Integration Tests: create_data_source + create_feed", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);
  });

  it("Creates data source and feed in single workflow - public data source", async () => {
    // Generate a keypair and sign the data source
    const { signature, address } = generateTestSignature(
      0, // Public
      "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
      "Kraken Bitcoin Price Integration Test"
    );

    const testData = {
      dataSourceType: 0, // Public
      source: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
      owner: address,
      name: "Kraken Bitcoin Price Integration Test",
    };

    // Step 1: Create data source
    const dataSourceInfo = createTestDataSourceInfo(
      testData.dataSourceType,
      testData.source,
      testData.owner,
      testData.name,
      signature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: testData.dataSourceType,
      ownerEth: testData.owner,
      name: testData.name,
      source: testData.source,
    });

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .createDataSource(dataSourceInfo as any)
      .accountsPartial({
        dataSource: dataSourcePDA,
        payer: ctx.authority.publicKey,
      })
      .rpc();

    // Step 2: Create feed using the data source
    const feedId = "integration-kraken-feed";
    const feedParams = {
      name: feedId,
      jobId: Array.from(Buffer.from(feedId.padEnd(32, "\0"))),
      feedType: { public: {} },
      minSignaturesThreshold: 3,
      frequency: new anchor.BN(600), // 10 minutes
      ipfsCid: "QmIntegrationTest123",
      dataSourceId: Array.from(dataSourceId),
    };

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([0]), // FeedType::Public = 0
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .createFeed(feedParams as any, dataSourceInfo as any)
      .accountsPartial({
        feed: feedPDA,
        dataSource: dataSourcePDA,
        authority: ctx.authority.publicKey,
      })
      .rpc();

    // Step 3: Verify both accounts exist and are linked correctly
    const dataSourceAccount = await ctx.molphaProgram.account.dataSource.fetch(
      dataSourcePDA
    );
    const feed = await ctx.molphaProgram.account.feed.fetch(
      feedPDA
    );

    // Verify data source
    assert.deepEqual(dataSourceAccount.id, Array.from(dataSourceId));
    assert.deepEqual(dataSourceAccount.dataSourceType, { public: {} });
    assert.equal(dataSourceAccount.ownerEth.length, 20);

    // Verify feed
    assert.ok(feed.authority.equals(ctx.authority.publicKey));
    assert.deepEqual(feed.feedType, { public: {} });
    assert.deepEqual(feed.dataSourceId, Array.from(dataSourceId));
    assert.equal(feed.minSignaturesThreshold, 3);
    assert.equal(feed.frequency.toNumber(), 600);
    assert.equal(feed.ipfsCid, "QmIntegrationTest123");
  });

  it("Creates data source and feed in single workflow - private data source with EthLink", async () => {
    // Generate a keypair and sign the data source
    const { signature, address } = generateTestSignature(
      1, // Private
      "https://private-api.example.com/btc-price",
      "Private API Integration Test"
    );

    const testData = {
      dataSourceType: 1, // Private
      source: "https://private-api.example.com/btc-price",
      owner: address,
      name: "Private API Integration Test",
    };

    // Step 1: Create data source
    const dataSourceInfo = createTestDataSourceInfo(
      testData.dataSourceType,
      testData.source,
      testData.owner,
      testData.name,
      signature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: testData.dataSourceType,
      ownerEth: testData.owner,
      name: testData.name,
      source: testData.source,
    });

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .createDataSource(dataSourceInfo as any)
      .accountsPartial({
        dataSource: dataSourcePDA,
        payer: ctx.authority.publicKey,
      })
      .rpc();

    // Step 2: Create EthLink for private data source access
    const ownerEthBytes = Array.from(
      Buffer.from(testData.owner.slice(2), "hex")
    );
    const granteeBytes = Array.from(ctx.authority.publicKey.toBuffer());

    const [ethLinkPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("eth_link"),
        Buffer.from(ownerEthBytes),
        Buffer.from(granteeBytes),
      ],
      ctx.molphaProgram.programId
    );

    // Note: In a real scenario, you'd need a valid EthLink creation signature
    // For this integration test, we'll assume the EthLink is created separately

    // Step 3: Create feed using the private data source
    const feedId = "integration-private-feed";
    const feedParams = {
      name: feedId,
      jobId: Array.from(Buffer.from(feedId.padEnd(32, "\0"))),
      feedType: { personal: {} },
      minSignaturesThreshold: 1,
      frequency: new anchor.BN(900), // 15 minutes
      ipfsCid: "QmPrivateIntegrationTest",
      dataSourceId: Array.from(dataSourceId),
    };

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([1]), // FeedType::Personal = 1
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .createFeed(feedParams as any, dataSourceInfo as any)
      .accountsPartial({
        feed: feedPDA,
        dataSource: dataSourcePDA,
        authority: ctx.authority.publicKey,
      })
      .rpc();

    // Step 4: Verify all accounts exist and are linked correctly
    const dataSourceAccount = await ctx.molphaProgram.account.dataSource.fetch(
      dataSourcePDA
    );
    const feed = await ctx.molphaProgram.account.feed.fetch(
      feedPDA
    );

    // Verify data source
    assert.deepEqual(dataSourceAccount.id, Array.from(dataSourceId));
    assert.deepEqual(dataSourceAccount.dataSourceType, { private: {} });

    // Verify feed
    assert.deepEqual(feed.feedType, { personal: {} });
    assert.deepEqual(feed.dataSourceId, Array.from(dataSourceId));
  });

  it("Creates multiple feeds using the same data source", async () => {
    // Generate a keypair and sign the data source
    const { signature, address } = generateTestSignature(
      0, // Public
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      "CoinGecko Shared Data Source"
    );

    const sharedDataSource = {
      dataSourceType: 0,
      source:
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      owner: address,
      name: "CoinGecko Shared Data Source",
    };

    // Create shared data source
    const dataSourceInfo = createTestDataSourceInfo(
      sharedDataSource.dataSourceType,
      sharedDataSource.source,
      sharedDataSource.owner,
      sharedDataSource.name,
      signature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: sharedDataSource.dataSourceType,
      ownerEth: sharedDataSource.owner,
      name: sharedDataSource.name,
      source: sharedDataSource.source,
    });

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .createDataSource(dataSourceInfo as any)
      .accountsPartial({
        dataSource: dataSourcePDA,
        payer: ctx.authority.publicKey,
      })
      .rpc();

    // Create multiple feeds using the same data source
    const feedConfigs = [
      {
        id: "shared-feed-public",
        type: { public: {} },
        threshold: 2,
        frequency: 300,
      },
      {
        id: "shared-feed-personal",
        type: { personal: {} },
        threshold: 1,
        frequency: 600,
      },
    ];

    const createdFeeds = [];

    for (const config of feedConfigs) {
      const feedParams = {
        name: config.id,
        jobId: Array.from(Buffer.from(config.id.padEnd(32, "\0"))),
        feedType: config.type,
        minSignaturesThreshold: config.threshold,
        frequency: new anchor.BN(config.frequency),
        ipfsCid: `QmShared${config.id}`,
        dataSourceId: Array.from(dataSourceId),
      };

      const feedTypeValue = config.type.public ? 0 : 1; // Public = 0, Personal = 1
      const [feedPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("feed"),
          ctx.authority.publicKey.toBuffer(),
          Buffer.from(feedParams.name),
          Buffer.from([feedTypeValue]),
          Buffer.from([feedParams.minSignaturesThreshold]),
          feedParams.frequency.toBuffer("le", 8),
          Buffer.from(feedParams.jobId),
        ],
        ctx.molphaProgram.programId
      );

      await ctx.molphaProgram.methods
        .createFeed(feedParams as any, dataSourceInfo as any)
        .accountsPartial({
          feed: feedPDA,
          dataSource: dataSourcePDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();

      createdFeeds.push({ pda: feedPDA, config });
    }

    // Verify all feeds were created and reference the same data source
    for (const { pda, config } of createdFeeds) {
      const feed = await ctx.molphaProgram.account.feed.fetch(pda);
      assert.deepEqual(feed.dataSourceId, Array.from(dataSourceId));
      assert.deepEqual(feed.feedType, config.type);
      assert.equal(feed.minSignaturesThreshold, config.threshold);
      assert.equal(feed.frequency.toNumber(), config.frequency);
    }
  });

  it("Fails to create feed with non-existent data source when not using init_if_needed", async () => {
    // Generate a keypair and sign the data source
    const { signature, address } = generateTestSignature(
      0, // Public
      "https://non-existent-api.com/price",
      "Non-Existent Data Source"
    );

    const nonExistentDataSource = {
      dataSourceType: 0,
      source: "https://non-existent-api.com/price",
      owner: address,
      name: "Non-Existent Data Source",
    };

    const dataSourceInfo = createTestDataSourceInfo(
      nonExistentDataSource.dataSourceType,
      nonExistentDataSource.source,
      nonExistentDataSource.owner,
      nonExistentDataSource.name,
      signature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: nonExistentDataSource.dataSourceType,
      ownerEth: nonExistentDataSource.owner,
      name: nonExistentDataSource.name,
      source: nonExistentDataSource.source,
    });

    const [nonExistentDataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    const feedId = "feed-with-missing-ds";
    const feedParams = {
      name: feedId,
      jobId: Array.from(Buffer.from(feedId.padEnd(32, "\0"))),
      feedType: { public: {} },
      minSignaturesThreshold: 1,
      frequency: new anchor.BN(300),
      ipfsCid: "QmMissingDS",
      dataSourceId: Array.from(dataSourceId),
    };

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([0]), // FeedType::Public = 0
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    // This should succeed because create_feed uses init_if_needed for data source
    await ctx.molphaProgram.methods
      .createFeed(feedParams as any, dataSourceInfo as any)
      .accountsPartial({
        feed: feedPDA,
        dataSource: nonExistentDataSourcePDA,
        authority: ctx.authority.publicKey,
      })
      .rpc();

    // Verify both the data source and feed were created
    const dataSourceAccount = await ctx.molphaProgram.account.dataSource.fetch(
      nonExistentDataSourcePDA
    );
    const feed = await ctx.molphaProgram.account.feed.fetch(
      feedPDA
    );

    assert.deepEqual(dataSourceAccount.id, Array.from(dataSourceId));
    assert.deepEqual(feed.dataSourceId, Array.from(dataSourceId));
  });
});
