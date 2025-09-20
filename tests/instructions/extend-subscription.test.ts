import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  setupTestContext,
  initializeProtocol,
  TestContext,
  createTestDataSourceInfo,
  getDataSourcePda,
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
  };

  let dataSourcePDA: PublicKey;
  let feedPDA: PublicKey;

  before(async () => {
    testDataSource = {
      dataSourceType: 0,
      source: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      name: "Bitcoin Price Feed",
    };

    // Create test data source for feed creation
    const dataSourceInfo = createTestDataSourceInfo(
      testDataSource.dataSourceType,
      testDataSource.source,
      testDataSource.name,
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
        .createDataSource(dataSourceInfo as any)
        .accountsPartial({
          authority: ctx.authority.publicKey,
          dataSource: dataSourcePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Ignore if already exists
    }

    // Create a feed with initial subscription
    const jobId = "btc-feed-subscription-test";
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

    // Create feed with 1 day subscription and 1000 lamports priority fee budget
    const subscriptionDurationSeconds = new anchor.BN(86400); // 1 day
    const priorityFeeBudget = new anchor.BN(1000); // 1000 lamports

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
      .accountsPartial({
        feed: feedPDA,
        authority: ctx.authority.publicKey,
        userTokenAccount: ctx.userTokenAccount,
        programTokenAccount: ctx.programTokenAccount,
        protocolConfig: ctx.protocolConfigPDA,
        underlyingToken: ctx.underlyingTokenMint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
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
        .accountsPartial({
          feed: feedPDA,
          authority: ctx.authority.publicKey,
          userTokenAccount: ctx.userTokenAccount,
          programTokenAccount: ctx.programTokenAccount,
          protocolConfig: ctx.protocolConfigPDA,
          underlyingToken: ctx.underlyingTokenMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
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
        .accountsPartial({
          feed: feedPDA,
          authority: differentAuthority.publicKey,
          userTokenAccount: ctx.userTokenAccount,
          programTokenAccount: ctx.programTokenAccount,
          protocolConfig: ctx.protocolConfigPDA,
          underlyingToken: ctx.underlyingTokenMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
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
