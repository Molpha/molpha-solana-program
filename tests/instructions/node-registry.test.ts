import { assert } from "chai";
import { setupTestContext, initializeProtocol, TestContext } from "../setup";

describe("Node Registry Instructions", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
    await initializeProtocol(ctx);
  });

  describe("Initialize", () => {
    it("Initializes the node registry PDA", async () => {
      const registryAccount = await ctx.molphaProgram.account.nodeRegistry.fetch(
        ctx.nodeRegistryPDA
      );
      assert.ok(registryAccount.authority.equals(ctx.authority.publicKey));
      assert.equal(registryAccount.nodes.length, 0);
    });
  });

  describe("Add Node", () => {
    it("Adds a node", async () => {
      const nodeToAdd = ctx.nodes[0];
      await ctx.molphaProgram.methods
        .addNode(nodeToAdd.publicKey)
        .accounts({
          nodeRegistry: ctx.nodeRegistryPDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();

      const registryAccount = await ctx.molphaProgram.account.nodeRegistry.fetch(
        ctx.nodeRegistryPDA
      );
      assert.equal(registryAccount.nodes.length, 1);
      assert.ok(registryAccount.nodes[0].equals(nodeToAdd.publicKey));
    });

    it("Fails to add a duplicate node", async () => {
      const nodeToAdd = ctx.nodes[0];
      try {
        await ctx.molphaProgram.methods
          .addNode(nodeToAdd.publicKey)
          .accounts({
            nodeRegistry: ctx.nodeRegistryPDA,
            authority: ctx.authority.publicKey,
          })
          .rpc();
        assert.fail("Should have failed to add a duplicate node.");
      } catch (error: any) {
        // The error happens at system level - trying to create an account that already exists
        assert.ok(
          error.message.includes("already in use") ||
            error.message.includes("custom program error: 0x0")
        );
      }
    });
  });

  describe("Remove Node", () => {
    it("Removes a node", async () => {
      const nodeToRemove = ctx.nodes[0];
      await ctx.molphaProgram.methods
        .removeNode(nodeToRemove.publicKey)
        .accounts({
          nodeRegistry: ctx.nodeRegistryPDA,
          authority: ctx.authority.publicKey,
        })
        .rpc();

      const registryAccount = await ctx.molphaProgram.account.nodeRegistry.fetch(
        ctx.nodeRegistryPDA
      );
      assert.equal(registryAccount.nodes.length, 0);
    });
  });
});
