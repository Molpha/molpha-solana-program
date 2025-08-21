import { assert } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { setupTestContext, initializeProtocol, TestContext, createTestDataSourceInfo, testSignature, computeDataSourceId, generateTestSignature } from "../setup";

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
    owner: "0xa408b7c5BC50fa392642C58B9758410ea3376a09", // Original owner from EVM tests
    name: "Name of Data Source",
  };

  const testSig = "0x945bf2247b7bec301df7f3ac7c849f9dba872077a6fe142f06a6185fa0e51815581ee2b3ee799728ca4ad0c6386440f52346db64265560ffbd2e8f5882c943211b"

  it("Successfully creates a private data source with valid EIP-712 signature", async () => {
    const dataSourceInfo = createTestDataSourceInfo(
      testDataSource.dataSourceType,
      testDataSource.source,
      testDataSource.owner,
      testDataSource.name,
      testSig
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

    await ctx.molphaProgram.methods
      .createDataSource(dataSourceInfo)
      .accounts({
        payer: ctx.authority.publicKey,
        dataSource: dataSourcePDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const dataSourceAccount = await ctx.molphaProgram.account.dataSource.fetch(
      dataSourcePDA
    );

    // Verify the account was created correctly
    assert.equal(Buffer.from(dataSourceAccount.id).toString("hex"), Buffer.from(dataSourceId).toString("hex"));
    assert.deepEqual(
      dataSourceAccount.ownerEth,
      Array.from(Buffer.from(testDataSource.owner.slice(2), "hex"))
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

    // Generate a keypair and sign the data
    const { signature, address } = generateTestSignature(
      publicDataSourceData.dataSourceType,
      publicDataSourceData.source,
      publicDataSourceData.name
    );

    const dataSourceInfo = createTestDataSourceInfo(
      publicDataSourceData.dataSourceType,
      publicDataSourceData.source,
      address, // Use the generated address
      publicDataSourceData.name,
      signature // Use the generated signature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: publicDataSourceData.dataSourceType,
      ownerEth: address,
      name: publicDataSourceData.name,
      source: publicDataSourceData.source,
    });

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .createDataSource(dataSourceInfo)
      .accounts({
        payer: ctx.authority.publicKey,
        dataSource: dataSourcePDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const dataSourceAccount = await ctx.molphaProgram.account.dataSource.fetch(
      dataSourcePDA
    );

    // Verify the account was created correctly
    assert.deepEqual(dataSourceAccount.id, Array.from(dataSourceId));
    assert.deepEqual(dataSourceAccount.dataSourceType, { public: {} });
    assert.deepEqual(
      dataSourceAccount.ownerEth,
      Array.from(Buffer.from(address.slice(2), "hex"))
    );
  });

  it("Fails to create data source with invalid signature", async () => {
    const invalidDataSource = {
      dataSourceType: 1,
      source: "https://example.com",
      owner: testDataSource.owner,
      name: "Invalid Test Data Source",
    };

    // Use the same signature but with different data (should fail verification)
    const dataSourceInfo = createTestDataSourceInfo(
      invalidDataSource.dataSourceType,
      invalidDataSource.source,
      invalidDataSource.owner,
      invalidDataSource.name,
      testSignature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: invalidDataSource.dataSourceType,
      ownerEth: invalidDataSource.owner,
      name: invalidDataSource.name,
      source: invalidDataSource.source,
    });

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo)
        .accounts({
          payer: ctx.authority.publicKey,
          dataSource: dataSourcePDA,
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

  it("Fails to create data source with wrong owner address", async () => {
    const wrongOwner = "0x1234567890123456789012345678901234567890";

    const dataSourceInfo = createTestDataSourceInfo(
      testDataSource.dataSourceType,
      testDataSource.source,
      wrongOwner, // Different owner than the signature
      testDataSource.name,
      testSignature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: testDataSource.dataSourceType,
      ownerEth: wrongOwner,
      name: testDataSource.name,
      source: testDataSource.source,
    });

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo)
        .accounts({
          payer: ctx.authority.publicKey,
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

  it("Fails to create duplicate data source", async () => {
    // Try to create the same data source again (should fail due to PDA collision)
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

    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo)
        .accounts({
          payer: ctx.authority.publicKey,
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

  it("Fails to create data source with empty source", async () => {
    const emptySourceData = {
      dataSourceType: 1,
      source: "",
      owner: testDataSource.owner,
      name: "Empty Source Test",
    };

    const dataSourceInfo = createTestDataSourceInfo(
      emptySourceData.dataSourceType,
      emptySourceData.source,
      emptySourceData.owner,
      emptySourceData.name,
      testSignature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: emptySourceData.dataSourceType,
      ownerEth: emptySourceData.owner,
      name: emptySourceData.name,
      source: emptySourceData.source,
    });

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo)
        .accounts({
          payer: ctx.authority.publicKey,
          dataSource: dataSourcePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with empty source");
    } catch (error: any) {
      assert.ok(
        error.message.includes("RecoveredAddressMismatch") ||
          error.message.includes("InvalidEthereumAddress") ||
          error.message.includes("custom program error")
      );
    }
  });

  it("Fails to create data source with empty name", async () => {
    const emptyNameData = {
      dataSourceType: 1,
      source: "https://example.com/api",
      owner: testDataSource.owner,
      name: "",
    };

    const dataSourceInfo = createTestDataSourceInfo(
      emptyNameData.dataSourceType,
      emptyNameData.source,
      emptyNameData.owner,
      emptyNameData.name,
      testSignature
    );

    const dataSourceId = computeDataSourceId({
      dataSourceType: emptyNameData.dataSourceType,
      ownerEth: emptyNameData.owner,
      name: emptyNameData.name,
      source: emptyNameData.source,
    });

    const [dataSourcePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data_source"), dataSourceId],
      ctx.molphaProgram.programId
    );

    try {
      await ctx.molphaProgram.methods
        .createDataSource(dataSourceInfo)
        .accounts({
          payer: ctx.authority.publicKey,
          dataSource: dataSourcePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with empty name");
    } catch (error: any) {
      assert.ok(
        error.message.includes("RecoveredAddressMismatch") ||
          error.message.includes("InvalidEthereumAddress") ||
          error.message.includes("custom program error")
      );
    }
  });
});
