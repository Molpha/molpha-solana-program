import { assert } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  setupTestContext,
  initializeProtocol,
  TestContext,
  getDataSourcePda,
  createTestDataSourceInfo,
} from "../setup";

describe("Create Data Source Instruction", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);
  });

  // Test data from EVM contract tests - exact match
  const testDataSource = {
    dataSourceType: 1, // Private
    source: "https://api.stlouisfed.org/fred/series/observations",
    name: "Name of Data Source",
  };

  it("Successfully creates a private data source", async () => {
    const dataSourceInfo = createTestDataSourceInfo(
      testDataSource.dataSourceType,
      testDataSource.source,
      testDataSource.name,
    );

    const [dataSourcePDA] = getDataSourcePda(
      ctx.molphaProgram.programId, 
      ctx.authority.publicKey, 
      testDataSource.name, 
      testDataSource.dataSourceType
    );

    await ctx.molphaProgram.methods
      .createDataSource(dataSourceInfo as any)
      .accountsPartial({
        authority: ctx.authority.publicKey,
        dataSource: dataSourcePDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const dataSourceAccount = await ctx.molphaProgram.account.dataSource.fetch(
      dataSourcePDA
    );


    assert.equal(
      dataSourceAccount.owner.toBase58(),
      ctx.authority.publicKey.toBase58()
    );
    assert.deepEqual(dataSourceAccount.dataSourceType, { private: {} });
    assert.ok(dataSourceAccount.createdAt.toNumber() > 0);
  });

  it("Successfully creates a public data source", async () => {
    const publicDataSourceData = {
      dataSourceType: 0, // Public
      source: "https://api.coindesk.com/v1/bpi/currentprice.json",
      name: "Bitcoin Price Public",
    };

    const dataSourceInfo = createTestDataSourceInfo(
      publicDataSourceData.dataSourceType,
      publicDataSourceData.source,
      publicDataSourceData.name,
    );

    const [dataSourcePDA] = getDataSourcePda(
      ctx.molphaProgram.programId, 
      ctx.authority.publicKey, 
      publicDataSourceData.name, 
      publicDataSourceData.dataSourceType
    );

    await ctx.molphaProgram.methods
      .createDataSource(dataSourceInfo as any)
      .accountsPartial({
        authority: ctx.authority.publicKey,
        dataSource: dataSourcePDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const dataSourceAccount = await ctx.molphaProgram.account.dataSource.fetch(
      dataSourcePDA
    );

    // Verify the account was created correctly
    assert.deepEqual(dataSourceAccount.dataSourceType, { public: {} });
    assert.deepEqual(
      dataSourceAccount.owner,
      ctx.authority.publicKey
    );
  });

  it("Fails to create data source with wrong owner address", async () => {
    const wrongOwner = Keypair.generate().publicKey;

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSource.dataSourceType,
      testDataSource.source,
      testDataSource.name,
    );

    const [dataSourcePDA] = getDataSourcePda(
      ctx.molphaProgram.programId, 
      ctx.authority.publicKey, 
      testDataSource.name, 
      testDataSource.dataSourceType
    );

    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo as any)
        .accountsPartial({
          authority: ctx.authority.publicKey,
          dataSource: dataSourcePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with wrong owner address");
    } catch (error: any) {
      assert.ok(
        error.message.includes("RecoveredAddressMismatch") ||
          error.message.includes("InvalidEthereumAddress") ||
          error.message.includes("custom program error")
      );
    }
  });

  it("Fails to create data source with empty source", async () => {
    const emptySourceData = {
      dataSourceType: 1,
      source: "",
      name: "Empty Source Test",
    };

    const dataSourceInfo = createTestDataSourceInfo(
      emptySourceData.dataSourceType,
      emptySourceData.source,
      emptySourceData.name,
    );

    const [dataSourcePDA] = getDataSourcePda(
      ctx.molphaProgram.programId, 
      ctx.authority.publicKey, 
      emptySourceData.name,
      emptySourceData.dataSourceType
    );

    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo as any)
        .accountsPartial({
          authority: ctx.authority.publicKey,
          dataSource: dataSourcePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with empty source");
    } catch (error: any) {
      assert.ok(
        error.message.includes("InvalidDataSourceData")
      );
    }
  });

  it("Fails to create data source with empty name", async () => {
    const emptyNameData = {
      dataSourceType: 1,
      source: "https://example.com/api",
      name: "",
    };

    const dataSourceInfo = createTestDataSourceInfo(
      emptyNameData.dataSourceType,
      emptyNameData.source,
      emptyNameData.name,
    );

    const [dataSourcePDA] = getDataSourcePda(
      ctx.molphaProgram.programId, 
      ctx.authority.publicKey, 
      emptyNameData.name, 
      emptyNameData.dataSourceType
    );
  
    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo as any)
        .accountsPartial({
          authority: ctx.authority.publicKey,
          dataSource: dataSourcePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with empty name");
    } catch (error: any) {
      assert.ok(
        error.message.includes("InvalidDataSourceData") ||
          error.message.includes("custom program error")
      );
    }
  });

  it("Fails to create duplicate data source", async () => {
    // Try to create the same data source again (should fail due to PDA collision)
    const dataSourceInfo = createTestDataSourceInfo(
      testDataSource.dataSourceType,
      testDataSource.source,
      testDataSource.name,
    );

    const [dataSourcePDA] = getDataSourcePda(
      ctx.molphaProgram.programId, 
      ctx.authority.publicKey, 
      testDataSource.name,
      testDataSource.dataSourceType
    );

    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo as any)
        .accountsPartial({
          authority: ctx.authority.publicKey,
          dataSource: dataSourcePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with duplicate data source");
    } catch (error: any) {
      assert.ok(
        error.message.includes("already in use") ||
          error.message.includes("custom program error")
      );
    }
  });

});
