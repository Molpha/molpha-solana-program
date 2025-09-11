import { assert } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  setupTestContext,
  initializeProtocol,
  TestContext,
  generatePermitSignature,
} from "../setup";

describe("Permit and Revoke Permit Instructions", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);
  });

  const testGrantee = "3EgTd7iNuGCdQSNr7GNnMdLAqeRYMzjt3jzD5LXaKA9x";

  it("Successfully creates a permit with valid EIP-712 signature", async () => {
    // Generate a keypair and sign the permit data
    const { signature, address } = generatePermitSignature(testGrantee);

    const ownerEthBytes = Array.from(Buffer.from(address.slice(2), "hex"));
    // Convert base58 Solana public key to bytes
    const granteePublicKey = new PublicKey(testGrantee);
    const granteeBytes = Array.from(granteePublicKey.toBuffer());

    // Extract recovery ID and convert from Ethereum format (27/28) to Solana format (0/1)
    const recoveryId = parseInt(signature.slice(-2), 16) - 27;
    const sigWithoutRecoveryId = Buffer.from(signature.slice(2, -2), "hex");
    const sigWithSolanaRecoveryId = Buffer.concat([
      sigWithoutRecoveryId,
      Buffer.from([recoveryId]),
    ]);
    const sig = Array.from(sigWithSolanaRecoveryId);

    const [ethLinkPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("eth_link"),
        Buffer.from(ownerEthBytes),
        Buffer.from(granteeBytes),
      ],
      ctx.molphaProgram.programId
    );

    await ctx.molphaProgram.methods
      .permit(ownerEthBytes, granteeBytes, sig)
      .accounts({
        payer: ctx.authority.publicKey,
        ethLinkPda: ethLinkPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const ethLinkAccount = await ctx.molphaProgram.account.ethLink.fetch(
      ethLinkPDA
    );
    assert.deepEqual(ethLinkAccount.ownerEth, ownerEthBytes);
    assert.deepEqual(ethLinkAccount.grantee, granteeBytes);
  });

  it("Successfully revokes a permit with valid EIP-712 signature", async () => {
    // Generate a keypair and sign the permit data
    const { signature, address } = generatePermitSignature(testGrantee);

    const ownerEthBytes = Array.from(Buffer.from(address.slice(2), "hex"));
    // Convert base58 Solana public key to bytes
    const granteePublicKey = new PublicKey(testGrantee);
    const granteeBytes = Array.from(granteePublicKey.toBuffer());

    // Extract recovery ID and convert from Ethereum format (27/28) to Solana format (0/1)
    const recoveryId = parseInt(signature.slice(-2), 16) - 27;
    const sigWithoutRecoveryId = Buffer.from(signature.slice(2, -2), "hex");
    const sigWithSolanaRecoveryId = Buffer.concat([
      sigWithoutRecoveryId,
      Buffer.from([recoveryId]),
    ]);
    const sig = Array.from(sigWithSolanaRecoveryId);

    const [ethLinkPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("eth_link"),
        Buffer.from(ownerEthBytes),
        Buffer.from(granteeBytes),
      ],
      ctx.molphaProgram.programId
    );

    // First create the permit
    await ctx.molphaProgram.methods
      .permit(ownerEthBytes, granteeBytes, sig)
      .accounts({
        payer: ctx.authority.publicKey,
        ethLinkPda: ethLinkPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Then revoke it with the same signature
    await ctx.molphaProgram.methods
      .revokePermit(ownerEthBytes, granteeBytes, sig)
      .accounts({
        payer: ctx.authority.publicKey,
        ethLinkPda: ethLinkPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify the account was closed
    try {
      await ctx.molphaProgram.account.ethLink.fetch(ethLinkPDA);
      assert.fail("Account should have been closed");
    } catch (error: any) {
      assert.equal(error.message, "Could not find " + ethLinkPDA.toString());
    }
  });
});
