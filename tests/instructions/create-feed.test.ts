import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  setupTestContext,
  initializeProtocol,
  TestContext,
  createTestDataSourceInfo,
  generateTestSignature,
  computeDataSourceId,
  createFeedParams,
} from "../setup";

describe("Create Feed Instruction", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);
  });

  // Test data sources for feed creation tests
  let testDataSources: {
    public: {
      dataSourceType: number;
      source: string;
      name: string;
      address: string;
      signature: string;
    };
    private: {
      dataSourceType: number;
      source: string;
      name: string;
      address: string;
      signature: string;
    };
  };

  let publicDataSourceId: Uint8Array;
  let privateDataSourceId: Uint8Array;
  let publicDataSourcePDA: PublicKey;
  let privateDataSourcePDA: PublicKey;

  before(async () => {
    // Generate test data sources with signatures
    const publicSigData = generateTestSignature(
      0, // Public
      "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      "Bitcoin Price Public Feed"
    );

    const privateSigData = generateTestSignature(
      1, // Private
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest",
      "CMC Private Bitcoin Feed"
    );

    testDataSources = {
      public: {
        dataSourceType: 0,
        source: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
        name: "Bitcoin Price Public Feed",
        address: publicSigData.address,
        signature: publicSigData.signature,
      },
      private: {
        dataSourceType: 1,
        source:
          "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest",
        name: "CMC Private Bitcoin Feed",
        address: privateSigData.address,
        signature: privateSigData.signature,
      },
    };

    // Create test data sources for feed creation
    const publicDataSourceInfo = createTestDataSourceInfo(
      testDataSources.public.dataSourceType,
      testDataSources.public.source,
      testDataSources.public.address,
      testDataSources.public.name,
      testDataSources.public.signature
    );

    const privateDataSourceInfo = createTestDataSourceInfo(
      testDataSources.private.dataSourceType,
      testDataSources.private.source,
      testDataSources.private.address,
      testDataSources.private.name,
      testDataSources.private.signature
    );

    publicDataSourceId = computeDataSourceId({
      dataSourceType: testDataSources.public.dataSourceType,
      ownerEth: testDataSources.public.address,
      name: testDataSources.public.name,
      source: testDataSources.public.source,
    });

    privateDataSourceId = computeDataSourceId({
      dataSourceType: testDataSources.private.dataSourceType,
      ownerEth: testDataSources.private.address,
      name: testDataSources.private.name,
      source: testDataSources.private.source,
    });

    [publicDataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), publicDataSourceId],
      ctx.molphaProgram.programId
    );

    [privateDataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), privateDataSourceId],
      ctx.molphaProgram.programId
    );

    // Create the data sources
    try {
      await ctx.molphaProgram.methods
        .createDataSource(publicDataSourceInfo)
        .accounts({
          payer: ctx.authority.publicKey,
          dataSource: publicDataSourcePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Ignore if already exists
    }

    try {
      await ctx.molphaProgram.methods
        .createDataSource(privateDataSourceInfo)
        .accounts({
          payer: ctx.authority.publicKey,
          dataSource: privateDataSourcePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Ignore if already exists
    }
  });

  it("Successfully creates a public feed with existing data source", async () => {
    const jobId = "public-btc-feed";
    const feedParams = createFeedParams(
      jobId,
      { public: {} },
      publicDataSourceId,
    );

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSources.public.dataSourceType,
      testDataSources.public.source,
      testDataSources.public.address,
      testDataSources.public.name,
      testDataSources.public.signature
    );

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([0]),
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .createFeed(feedParams, dataSourceInfo)
      .accounts({
        feed: feedPDA,
        dataSource: publicDataSourcePDA,
        ethLinkPda: null,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const feed = await ctx.molphaProgram.account.feed.fetch(
      feedPDA
    );

    // Verify the feed was created correctly
    assert.ok(feed.authority.equals(ctx.authority.publicKey));
    assert.deepEqual(feed.feedType, { public: {} });
    assert.equal(feed.minSignaturesThreshold, 2);
    assert.equal(feed.frequency.toNumber(), 300);
    assert.equal(feed.ipfsCid, "QmTestCID123456789");
    assert.deepEqual(feed.dataSourceId, Array.from(publicDataSourceId));
    assert.deepEqual(
      feed.jobId,
      Array.from(Buffer.from(jobId.padEnd(32, "\0")))
    );
  });

  it("Successfully creates a personal feed with existing data source", async () => {
    const jobId = "personal-btc-feed";
    const feedParams = createFeedParams(
      jobId,
      { personal: {} },
      publicDataSourceId
    );

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSources.public.dataSourceType,
      testDataSources.public.source,
      testDataSources.public.address,
      testDataSources.public.name,
      testDataSources.public.signature
    );

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([1]),
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    

    await ctx.molphaProgram.methods
      .createFeed(feedParams, dataSourceInfo)
      .accounts({
        feed: feedPDA,
        dataSource: publicDataSourcePDA,
        ethLinkPda: null,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const feed = await ctx.molphaProgram.account.feed.fetch(
      feedPDA
    );

    // Verify the feed was created correctly
    assert.deepEqual(feed.feedType, { personal: {} });
    assert.equal(feed.minSignaturesThreshold, 2);
  });

  it("Successfully creates a feed with new data source (init_if_needed)", async () => {
    // Generate signature for new data source
    const { signature, address } = generateTestSignature(
      0, // Public
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
      "Binance Bitcoin Price"
    );

    const newDataSource = {
      dataSourceType: 0,
      source: "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
      address: address,
      name: "Binance Bitcoin Price",
    };

    const newDataSourceInfo = createTestDataSourceInfo(
      newDataSource.dataSourceType,
      newDataSource.source,
      newDataSource.address,
      newDataSource.name,
      signature
    );

    const newDataSourceId = computeDataSourceId({
      dataSourceType: newDataSource.dataSourceType,
      ownerEth: newDataSource.address,
      name: newDataSource.name,
      source: newDataSource.source,
    });

    const [newDataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), newDataSourceId],
      ctx.molphaProgram.programId
    );

    const jobId = "binance-btc-feed";
    const feedParams = createFeedParams(
      jobId,
      { public: {} },
      newDataSourceId
    );

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([0]),
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .createFeed(feedParams, newDataSourceInfo)
      .accounts({
        feed: feedPDA,
        dataSource: newDataSourcePDA,
        ethLinkPda: null,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify both feed and data source were created
    const feed = await ctx.molphaProgram.account.feed.fetch(
      feedPDA
    );
    const dataSourceAccount = await ctx.molphaProgram.account.dataSource.fetch(
      newDataSourcePDA
    );

    assert.deepEqual(feed.dataSourceId, Array.from(newDataSourceId));
    assert.deepEqual(dataSourceAccount.id, Array.from(newDataSourceId));
  });

  it("Successfully creates a private feed with EthLink", async () => {
    const jobId = "private-feed-with-link";
    const feedParams = createFeedParams(
      jobId,
      { personal: {} },
      privateDataSourceId
    );

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSources.private.dataSourceType,
      testDataSources.private.source,
      testDataSources.private.address,
      testDataSources.private.name,
      testDataSources.private.signature
    );

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([1]),
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    const ownerEthBytes = Array.from(
      Buffer.from(testDataSources.private.address.slice(2), "hex")
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

    await ctx.molphaProgram.methods
      .createFeed(feedParams, dataSourceInfo)
      .accounts({
        feed: feedPDA,
        dataSource: privateDataSourcePDA,
        ethLinkPda: ethLinkPDA,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const feed = await ctx.molphaProgram.account.feed.fetch(
      feedPDA
    );
    assert.deepEqual(feed.dataSourceId, Array.from(privateDataSourceId));
  });

  it("Fails to create feed with zero min_signatures_threshold", async () => {
    const jobId = "invalid-threshold-feed";
    const invalidParams = {
      name: jobId,
      jobId: Array.from(Buffer.from(jobId.padEnd(32, "\0"))),
      feedType: { public: {} },
      minSignaturesThreshold: 0, // Invalid: should be > 0
      frequency: new anchor.BN(300),
      ipfsCid: "QmTestCID123456789",
      dataSourceId: Array.from(publicDataSourceId),
    };

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSources.public.dataSourceType,
      testDataSources.public.source,
      testDataSources.public.address,
      testDataSources.public.name,
      testDataSources.public.signature
    );

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(invalidParams.name),
        Buffer.from([0]),
        Buffer.from([invalidParams.minSignaturesThreshold]),
        invalidParams.frequency.toBuffer("le", 8),
        Buffer.from(invalidParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createFeed(invalidParams, dataSourceInfo)
        .accounts({
          feed: feedPDA,
          dataSource: publicDataSourcePDA,
          ethLinkPda: null,
          authority: ctx.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with zero threshold");
    } catch (error: any) {
      assert.ok(
        error.message.includes("InvalidFeedConfig") ||
          error.message.includes("custom program error")
      );
    }
  });

  it("Fails to create feed with empty IPFS CID", async () => {
    const jobId = "invalid-cid-feed";
    const invalidParams = {
      name: jobId,
      jobId: Array.from(Buffer.from(jobId.padEnd(32, "\0"))),
      feedType: { public: {} },
      minSignaturesThreshold: 2,
      frequency: new anchor.BN(300),
      ipfsCid: "", // Invalid: should not be empty
      dataSourceId: Array.from(publicDataSourceId),
    };

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSources.public.dataSourceType,
      testDataSources.public.source,
      testDataSources.public.address,
      testDataSources.public.name,
      testDataSources.public.signature
    );

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(invalidParams.name),
        Buffer.from([0]),
        Buffer.from([invalidParams.minSignaturesThreshold]),
        invalidParams.frequency.toBuffer("le", 8),
        Buffer.from(invalidParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createFeed(invalidParams, dataSourceInfo)
        .accounts({
          feed: feedPDA,
          dataSource: publicDataSourcePDA,
          ethLinkPda: null,
          authority: ctx.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with empty IPFS CID");
    } catch (error: any) {
      assert.ok(
        error.message.includes("InvalidFeedConfig") ||
          error.message.includes("custom program error")
      );
    }
  });

  it("Fails to create feed with mismatched data source ID", async () => {
    const jobId = "mismatched-ds-feed";
    const wrongDataSourceId = new Uint8Array(32).fill(255); // Wrong ID

    const feedParams = createFeedParams(
      jobId,
      { public: {} },
      wrongDataSourceId
    );

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSources.public.dataSourceType,
      testDataSources.public.source,
      testDataSources.public.address,
      testDataSources.public.name,
      testDataSources.public.signature
    );

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), wrongDataSourceId],
      ctx.molphaProgram.programId
    );

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([0]),
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createFeed(feedParams, dataSourceInfo)
        .accounts({
          feed: feedPDA,
          dataSource: dataSourcePDA,
          ethLinkPda: null,
          authority: ctx.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with mismatched data source ID");
    } catch (error: any) {
      assert.ok(error.message.includes("InvalidDataSource"));
    }
  });

  it("Fails to create private feed without EthLink when required", async () => {
    const jobId = "private-no-link-feed";
    const feedParams = createFeedParams(
      jobId,
      { personal: {} },
      privateDataSourceId
    );

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSources.private.dataSourceType,
      testDataSources.private.source,
      testDataSources.private.address,
      testDataSources.private.name,
      testDataSources.private.signature
    );

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([1]),
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createFeed(feedParams, dataSourceInfo)
        .accounts({
          feed: feedPDA,
          dataSource: privateDataSourcePDA,
          ethLinkPda: null, // Missing EthLink for private data source
          authority: ctx.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed without EthLink for private data source");
    } catch (error: any) {
      assert.ok(
        error.message.includes("InvalidDataSource") ||
          error.message.includes("custom program error")
      );
    }
  });

  it("Fails to create duplicate feed", async () => {
    const jobId = "public-btc-feed"; // Same as first test
    const feedParams = createFeedParams(
      jobId,
      { public: {} },
      publicDataSourceId
    );

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSources.public.dataSourceType,
      testDataSources.public.source,
      testDataSources.public.address,
      testDataSources.public.name,
      testDataSources.public.signature
    );

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([0]),
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createFeed(feedParams, dataSourceInfo)
        .accounts({
          feed: feedPDA,
          dataSource: publicDataSourcePDA,
          ethLinkPda: null,
          authority: ctx.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with duplicate feed");
    } catch (error: any) {
      assert.ok(
        error.message.includes("already in use") ||
          error.message.includes("custom program error")
      );
    }
  });

  it("Fails to create feed with invalid data source signature", async () => {
    const jobId = "invalid-sig-feed";

    // Use wrong data for signature verification
    const invalidDataSourceInfo = createTestDataSourceInfo(
      testDataSources.public.dataSourceType,
      "https://wrong-source.com", // Different source
      testDataSources.public.address,
      testDataSources.public.name,
      testDataSources.public.signature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: testDataSources.public.dataSourceType,
      ownerEth: testDataSources.public.address,
      name: testDataSources.public.name,
      source: "https://wrong-source.com",
    });

    const feedParams = createFeedParams(
      jobId,
      { public: {} },
      dataSourceId
    );

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    const [feedPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("feed"),
        ctx.authority.publicKey.toBuffer(),
        Buffer.from(feedParams.name),
        Buffer.from([0]),
        Buffer.from([feedParams.minSignaturesThreshold]),
        feedParams.frequency.toBuffer("le", 8),
        Buffer.from(feedParams.jobId),
      ],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createFeed(feedParams, invalidDataSourceInfo)
        .accounts({
          feed: feedPDA,
          dataSource: dataSourcePDA,
          ethLinkPda: null,
          authority: ctx.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with invalid signature");
    } catch (error: any) {
      assert.ok(
        error.message.includes("RecoveredAddressMismatch") ||
          error.message.includes("InvalidEthereumAddress") ||
          error.message.includes("custom program error")
      );
    }
  });
});
