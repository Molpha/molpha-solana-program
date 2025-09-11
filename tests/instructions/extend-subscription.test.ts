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
import { Clock } from "solana-bankrun";

describe("Extend Subscription Instruction", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);
  });

  // Test data source for subscription tests
  let testDataSource: {
    dataSourceType: number;
    source: string;
    name: string;
    address: string;
    signature: string;
  };

  let dataSourceId: Uint8Array;
  let dataSourcePDA: PublicKey;
  let feedPDA: PublicKey;

  before(async () => {
    // Generate test data source with signature
    const sigData = generateTestSignature(
      0, // Public
      "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      "Bitcoin Price Feed"
    );

    testDataSource = {
      dataSourceType: 0,
      source: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      name: "Bitcoin Price Feed",
      address: sigData.address,
      signature: sigData.signature,
    };

    // Create test data source for feed creation
    const dataSourceInfo = createTestDataSourceInfo(
      testDataSource.dataSourceType,
      testDataSource.source,
      testDataSource.address,
      testDataSource.name,
      testDataSource.signature
    );

    dataSourceId = computeDataSourceId({
      dataSourceType: testDataSource.dataSourceType,
      ownerEth: testDataSource.address,
      name: testDataSource.name,
      source: testDataSource.source,
    });

    [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    // Create the data source
    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo)
        .accounts({
          payer: ctx.authority.publicKey,
          dataSource: dataSourcePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Ignore if already exists
    }

    // Create a feed with initial subscription
    const jobId = "btc-feed-subscription-test";
    const feedParams = createFeedParams(jobId, { public: {} }, dataSourceId);

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

    // Create feed with 1 day subscription and 1000 lamports priority fee budget
    const subscriptionDurationSeconds = new anchor.BN(86400); // 1 day
    const priorityFeeBudget = new anchor.BN(1000); // 1000 lamports

    await ctx.molphaProgram.methods
      .createFeed(
        feedParams,
        dataSourceInfo,
        subscriptionDurationSeconds,
        priorityFeeBudget
      )
      .accounts({
        feed: feedPDA,
        dataSource: dataSourcePDA,
        ethLinkPda: null,
        authority: ctx.authority.publicKey,
        protocolConfig: ctx.protocolConfigPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("Successfully extends subscription with additional time and priority fee budget", async () => {
    const additionalDurationSeconds = new anchor.BN(86400); // 1 day
    const additionalPriorityFeeBudget = new anchor.BN(500); // 500 lamports

    // Get initial feed state
    const initialFeed = await ctx.molphaProgram.account.feed.fetch(feedPDA);
    const initialDueTime = initialFeed.subscriptionDueTime;
    const initialPriorityAllowance = initialFeed.priorityFeeAllowance;
    const initialBalance = initialFeed.balance;

    // Extend subscription
    await ctx.molphaProgram.methods
      .extendSubscription(
        additionalDurationSeconds,
        additionalPriorityFeeBudget
      )
      .accounts({
        feed: feedPDA,
        authority: ctx.authority.publicKey,
        protocolConfig: ctx.protocolConfigPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Get updated feed state
    const updatedFeed = await ctx.molphaProgram.account.feed.fetch(feedPDA);

    // Verify subscription was extended
    assert.equal(
      updatedFeed.subscriptionDueTime.toNumber(),
      initialDueTime.add(additionalDurationSeconds).toNumber(),
      "Subscription due time should be extended"
    );

    assert.equal(
      updatedFeed.priorityFeeAllowance.toNumber(),
      initialPriorityAllowance.add(additionalPriorityFeeBudget).toNumber(),
      "Priority fee allowance should be increased"
    );

    assert.equal(
      updatedFeed.balance.toNumber(),
      initialBalance
        .add(
          additionalDurationSeconds
            .mul(updatedFeed.pricePerSecondScaled)
            .div(new anchor.BN(1000000))
        )
        .add(additionalPriorityFeeBudget)
        .toNumber(),
      "Feed balance should be increased by extension cost"
    );
  });

  it("Fails to extend subscription with duration less than 1 hour", async () => {
    const additionalDurationSeconds = new anchor.BN(1800); // 30 minutes (less than 1 hour)
    const additionalPriorityFeeBudget = new anchor.BN(100); // 100 lamports

    try {
      await ctx.molphaProgram.methods
        .extendSubscription(
          additionalDurationSeconds,
          additionalPriorityFeeBudget
        )
        .accounts({
          feed: feedPDA,
          authority: ctx.authority.publicKey,
          protocolConfig: ctx.protocolConfigPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      assert.fail("Should have failed with minimum extension time error");
    } catch (error) {
      assert.include(error.message, "MinimumExtensionTime");
    }
  });

  it("Fails to extend subscription when caller is not the feed authority", async () => {
    const additionalDurationSeconds = new anchor.BN(3600); // 1 hour
    const additionalPriorityFeeBudget = new anchor.BN(100); // 100 lamports

    // Create a different authority
    const differentAuthority = anchor.web3.Keypair.generate();

    try {
      await ctx.molphaProgram.methods
        .extendSubscription(
          additionalDurationSeconds,
          additionalPriorityFeeBudget
        )
        .accounts({
          feed: feedPDA,
          authority: differentAuthority.publicKey,
          protocolConfig: ctx.protocolConfigPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([differentAuthority])
        .rpc();

      assert.fail("Should have failed with authority mismatch error");
    } catch (error) {
      // Should fail because differentAuthority is not the feed owner
      assert.include(error.message, "Error");
    }
  });
});
