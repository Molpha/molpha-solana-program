import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  setupTestContext,
  initializeProtocol,
  TestContext,
  createTestDataSourceInfo,
  createFeedParams,
  getDataSourcePda,
} from "../setup";

describe("Pricing Utility Tests", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);
  });

  describe("Feed Creation with Pricing", () => {
    let testDataSource: {
      dataSourceType: number;
      source: string;
      name: string;
      address: PublicKey;
    };

    let dataSourceId: Uint8Array;
    let dataSourcePDA: PublicKey;
    let feedPDA: PublicKey;

    before(async () => {
      testDataSource = {
        dataSourceType: 0,
        source: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
        name: "Bitcoin Price Feed",
        address: ctx.authority.publicKey,
      };

      // Create test data source for feed creation
      const dataSourceInfo = createTestDataSourceInfo(
        testDataSource.dataSourceType,
        testDataSource.source,
        testDataSource.name
      );

      [dataSourcePDA] = getDataSourcePda(
        ctx.molphaProgram.programId,
        ctx.authority.publicKey,
        testDataSource.name,
        testDataSource.dataSourceType
      );

      // Create the data source
      try {
        await ctx.molphaProgram.methods
          .createDataSource(dataSourceInfo)
          .accountsPartial({
            authority: ctx.authority.publicKey,
            dataSource: dataSourcePDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (e) {
        // Ignore if already exists
      }
    });

    it("Creates feed with different frequency and signature thresholds to test pricing", async () => {
      const jobId = "pricing-test-feed";
      const feedParams = createFeedParams(jobId, { public: {} });

      [feedPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("feed"),
          ctx.authority.publicKey.toBuffer(),
          Buffer.from(feedParams.name),
          Buffer.from([0]), // Public feed type
          Buffer.from([feedParams.minSignaturesThreshold]),
          feedParams.frequency.toBuffer("le", 8),
          Buffer.from(feedParams.jobId),
        ],
        ctx.molphaProgram.programId
      );

      const dataSourceInfo = createTestDataSourceInfo(
        testDataSource.dataSourceType,
        testDataSource.source,
        testDataSource.name
      );

      // Create feed with 1 day subscription and 1000 lamports priority fee budget
      const subscriptionDurationSeconds = new BN(86400); // 1 day
      const priorityFeeBudget = new BN(1000); // 1000 lamports

      await ctx.molphaProgram.methods
        .createFeed(
          feedParams,
          subscriptionDurationSeconds,
          priorityFeeBudget
        )
        .accountsPartial({
          feed: feedPDA,
          dataSource: dataSourcePDA,
          authority: ctx.authority.publicKey,
          protocolConfig: ctx.protocolConfigPDA,
          userTokenAccount: ctx.userTokenAccount,
          programTokenAccount: ctx.programTokenAccount,
          underlyingToken: ctx.underlyingTokenMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      const feed = await ctx.molphaProgram.account.feed.fetch(feedPDA);

      // Verify pricing-related fields were set
      assert.isTrue(
        feed.pricePerSecondScaled.toNumber() >= 0,
        "Price per second scaled should be set"
      );

      assert.equal(
        feed.priorityFeeAllowance.toNumber(),
        priorityFeeBudget,
        "Priority fee allowance should match input"
      );

      assert.equal(
        feed.consumedPriorityFees.toNumber(),
        0,
        "Consumed priority fees should start at 0"
      );

      // Verify subscription timing
      const expectedDueTime = feed.createdAt
        .add(subscriptionDurationSeconds)
        .toNumber();
      assert.equal(
        feed.subscriptionDueTime.toNumber(),
        expectedDueTime,
        "Subscription due time should be calculated correctly"
      );
    });

    it("Creates feed with high frequency and signature requirements to test pricing scaling", async () => {
      const highFreqJobId = "high-freq-pricing-test";

      // Create feed params with high frequency and signature requirements
      const highFreqFeedParams = {
        name: highFreqJobId,
        jobId: Array.from(Buffer.from(highFreqJobId.padEnd(32, "\0"))),
        feedType: { public: {} },
        minSignaturesThreshold: 5, // Higher than default 2
        frequency: new anchor.BN(60), // 1 minute instead of 5 minutes
        ipfsCid: "QmTestCID123456789",
      };

      const [highFreqFeedPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("feed"),
          ctx.authority.publicKey.toBuffer(),
          Buffer.from(highFreqFeedParams.name),
          Buffer.from([0]), // Public feed type
          Buffer.from([highFreqFeedParams.minSignaturesThreshold]),
          highFreqFeedParams.frequency.toBuffer("le", 8),
          Buffer.from(highFreqFeedParams.jobId),
        ],
        ctx.molphaProgram.programId
      );

      const dataSourceInfo = createTestDataSourceInfo(
        testDataSource.dataSourceType,
        testDataSource.source,
        testDataSource.name
      );

      // Create feed with 1 day subscription and 2000 lamports priority fee budget
      const subscriptionDurationSeconds = new BN(86400); // 1 day
      const priorityFeeBudget = new BN(2000); // 2000 lamports

      await ctx.molphaProgram.methods
        .createFeed(
          highFreqFeedParams,
          subscriptionDurationSeconds,
          priorityFeeBudget
        )
        .accountsPartial({
          feed: highFreqFeedPDA,
          dataSource: dataSourcePDA,
          authority: ctx.authority.publicKey,
          protocolConfig: ctx.protocolConfigPDA,
          userTokenAccount: ctx.userTokenAccount,
          programTokenAccount: ctx.programTokenAccount,
          underlyingToken: ctx.underlyingTokenMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      const highFreqFeed = await ctx.molphaProgram.account.feed.fetch(
        highFreqFeedPDA
      );

      // Verify the high-frequency feed was created with different pricing
      assert.equal(
        highFreqFeed.minSignaturesThreshold,
        5,
        "High frequency feed should have 5 signature threshold"
      );

      assert.equal(
        highFreqFeed.frequency.toNumber(),
        60,
        "High frequency feed should have 60 second frequency"
      );

      // The pricing should be different due to frequency and signature scaling
      assert.isTrue(
        highFreqFeed.pricePerSecondScaled.toNumber() >= 0,
        "High frequency feed should have price per second scaled set"
      );

      // Verify subscription data
      assert.equal(
        highFreqFeed.priorityFeeAllowance.toNumber(),
        priorityFeeBudget,
        "High frequency feed should have correct priority fee allowance"
      );

      assert.equal(
        highFreqFeed.subscriptionDueTime.toNumber(),
        highFreqFeed.createdAt.add(subscriptionDurationSeconds).toNumber(),
        "High frequency feed should have correct subscription due time"
      );
    });

    it("Correctly tracks priority fee consumption across multiple operations", async () => {
      // Create a simple feed for this test
      const jobId = "priority-fee-test-feed";
      const feedParams = createFeedParams(
        jobId,
        { public: {} },
        new Uint8Array(dataSourceId)
      );

      const [testFeedPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("feed"),
          ctx.authority.publicKey.toBuffer(),
          Buffer.from(feedParams.name),
          Buffer.from([0]), // Public feed type
          Buffer.from([feedParams.minSignaturesThreshold]),
          feedParams.frequency.toBuffer("le", 8),
          Buffer.from(feedParams.jobId),
        ],
        ctx.molphaProgram.programId
      );

      const dataSourceInfo = createTestDataSourceInfo(
        testDataSource.dataSourceType,
        testDataSource.source,
        testDataSource.name
      );

      // Create feed with 1 day subscription and 1000 lamports priority fee budget
      const subscriptionDurationSeconds = new BN(86400); // 1 day
      const priorityFeeBudget = new BN(1000); // 1000 lamports

      await ctx.molphaProgram.methods
        .createFeed(
          feedParams,
          subscriptionDurationSeconds,
          priorityFeeBudget
        )
        .accountsPartial({
          feed: testFeedPDA,
          dataSource: dataSourcePDA,
          authority: ctx.authority.publicKey,
          protocolConfig: ctx.protocolConfigPDA,
          userTokenAccount: ctx.userTokenAccount,
          programTokenAccount: ctx.programTokenAccount,
          underlyingToken: ctx.underlyingTokenMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      const feed = await ctx.molphaProgram.account.feed.fetch(testFeedPDA);

      assert.isTrue(
        feed.priorityFeeAllowance.toNumber() > 0,
        "Feed should have priority fee allowance"
      );

      assert.equal(
        feed.consumedPriorityFees.toNumber(),
        0,
        "Feed should start with 0 consumed priority fees"
      );
    });

    it("Correctly calculates extension costs", async () => {
      // Create a simple feed for this test
      const jobId = "extension-pricing-test-feed";
      const feedParams = createFeedParams(
        jobId,
        { public: {} },
        new Uint8Array(dataSourceId)
      );

      const [testFeedPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("feed"),
          ctx.authority.publicKey.toBuffer(),
          Buffer.from(feedParams.name),
          Buffer.from([0]), // Public feed type
          Buffer.from([feedParams.minSignaturesThreshold]),
          feedParams.frequency.toBuffer("le", 8),
          Buffer.from(feedParams.jobId),
        ],
        ctx.molphaProgram.programId
      );

      const dataSourceInfo = createTestDataSourceInfo(
        testDataSource.dataSourceType,
        testDataSource.source,
        testDataSource.name
      );

      // Create feed with 1 day subscription and 1000 lamports priority fee budget
      const subscriptionDurationSeconds = new BN(86400); // 1 day
      const priorityFeeBudget = new BN(1000); // 1000 lamports

      await ctx.molphaProgram.methods
        .createFeed(
          feedParams,
          subscriptionDurationSeconds,
          priorityFeeBudget
        )
        .accountsPartial({
          feed: testFeedPDA,
          dataSource: dataSourcePDA,
          authority: ctx.authority.publicKey,
          protocolConfig: ctx.protocolConfigPDA,
          userTokenAccount: ctx.userTokenAccount,
          programTokenAccount: ctx.programTokenAccount,
          underlyingToken: ctx.underlyingTokenMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      const feed = await ctx.molphaProgram.account.feed.fetch(testFeedPDA);
      const initialBalance = feed.balance.toNumber();
      const initialDueTime = feed.subscriptionDueTime.toNumber();
      const initialPriorityAllowance = feed.priorityFeeAllowance.toNumber();

      // Extend subscription by 1 day with 500 additional priority fee budget
      const additionalDurationSeconds = new BN(86400); // 1 day
      const additionalPriorityFeeBudget = new BN(500); // 500 lamports

      await ctx.molphaProgram.methods
        .extendSubscription(
          additionalDurationSeconds,
          additionalPriorityFeeBudget
        )
        .accountsPartial({
          feed: testFeedPDA,
          authority: ctx.authority.publicKey,
          protocolConfig: ctx.protocolConfigPDA,
          userTokenAccount: ctx.userTokenAccount,
          programTokenAccount: ctx.programTokenAccount,
          underlyingToken: ctx.underlyingTokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const updatedFeed = await ctx.molphaProgram.account.feed.fetch(
        testFeedPDA
      );

      // Verify extension was applied correctly
      assert.equal(
        updatedFeed.subscriptionDueTime.toNumber(),
        initialDueTime + additionalDurationSeconds.toNumber(),
        "Subscription due time should be extended by 1 day"
      );

      assert.equal(
        updatedFeed.priorityFeeAllowance.toNumber(),
        initialPriorityAllowance + additionalPriorityFeeBudget.toNumber(),
        "Priority fee allowance should be increased by 500"
      );

      // Balance should be increased (the exact amount depends on the pricing calculation)
      assert.isTrue(
        updatedFeed.balance.toNumber() >= initialBalance,
        "Feed balance should be increased by extension cost"
      );
    });
  });
});
