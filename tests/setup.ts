import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError, Wallet } from "@coral-xyz/anchor";
import { Molpha } from "../target/types/molpha";
import { ethers } from "ethers";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { BankrunProvider } from "anchor-bankrun";
import * as toml from "toml";
import * as fs from "fs";
import { AddedAccount, startAnchor } from "solana-bankrun";

export interface TestContext {
  molphaProgram: Program<Molpha>;
  nodeRegistryPDA: PublicKey;
  protocolConfigPDA: PublicKey;
  nodes: Keypair[];
  authority: anchor.Wallet;
  provider: BankrunProvider;
}

function getProgramId(): PublicKey {
  const anchorToml = toml.parse(fs.readFileSync("./Anchor.toml", "utf-8"));

  return new PublicKey(anchorToml.programs.localnet.molpha);
}

export async function createAccounts() {
  // Load wallet
  console.log("Loading local wallet...");
  const wallet = loadWallet().payer;

  // Create Service Provider KeyPair
  console.log("Creating Service Provider KeyPair...");
  const user = Keypair.generate();

  const newAccounts = {
    wallet,
    user,
  };

  const wa = Object.values(newAccounts).map((acc) => ({
    address: acc.publicKey,
    info: {
      lamports: 1000_000_000_000,
      executable: false,
      owner: anchor.web3.SystemProgram.programId,
      data: Buffer.alloc(0),
    },
  }));

  // // Connection to mainnet for cloning accounts
  // const connection = new Connection('https://api.mainnet-beta.solana.com')

  // // Add Raydium config account
  // const raydiumConfig = await connection.getAccountInfo(RAYDIUM_CONFIG)
  // addedAccounts.push({
  //   address: RAYDIUM_CONFIG,
  //   info: raydiumConfig,
  // })

  // // Add Raydium pool fee receiver account
  // const raydiumPoolFeeReceiver = await connection.getAccountInfo(
  //   RAYDIUM_POOL_FEE_RECEIVER,
  // )
  // addedAccounts.push({
  //   address: RAYDIUM_POOL_FEE_RECEIVER,
  //   info: raydiumPoolFeeReceiver,
  // })

  return {
    ...newAccounts,
    addedAccounts: wa,
  };
}

export async function getProvider() {
  // In Bankrun, the default wallet is pre-funded with SOL
  // We can use it directly - no need to create a new wallet
  const wallet = loadWallet();

  const newAccounts = { wallet };
  // Set the balance of testAccount
  const wa = Object.values(newAccounts).map((acc) => ({
    address: acc.publicKey,
    info: {
      lamports: 1000_000_000_000,
      executable: false,
      owner: anchor.web3.SystemProgram.programId,
      data: Buffer.alloc(0),
    },
  }));

  const context = await startAnchor(
    ".",
    [
      {
        name: "molpha",
        programId: new PublicKey(
          "7MgLh8MFfPrs4Jmx9z3hTq7oapXavoZQ2UXJmy3vdozx"
        ),
      },
    ],
    wa
  );
  const provider = new BankrunProvider(context);
  provider.wallet = new Wallet(wallet.payer);

  return provider;
}

export function loadWallet(): anchor.Wallet {
  const walletPath = `${require("os").homedir()}/.config/solana/id.json`;
  const secretKeyString = fs.readFileSync(walletPath, "utf8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const keypair = Keypair.fromSecretKey(secretKey);
  return new anchor.Wallet(keypair);
}

export async function setupTestContext(): Promise<TestContext> {
  const provider = await getProvider();
  anchor.setProvider(provider);

  const molphaProgram = anchor.workspace.Molpha as Program<Molpha>;
  const authority = provider.wallet as anchor.Wallet;

  const [nodeRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("node-registry")],
    molphaProgram.programId
  );

  const [protocolConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    molphaProgram.programId
  );

  const nodes: Keypair[] = [];
  const MAX_NODES = 5;

  for (let i = 0; i < MAX_NODES; i++) {
    nodes.push(Keypair.generate());
  }

  return {
    molphaProgram,
    nodeRegistryPDA,
    protocolConfigPDA,
    nodes,
    authority,
    provider,
  };
}

export async function initializeProtocol(ctx: TestContext): Promise<void> {
  try {
    // Initialize the node registry
    await ctx.molphaProgram.methods
      .initialize()
      .accounts({
        nodeRegistry: ctx.nodeRegistryPDA,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  } catch (e) {
    // Ignore if already initialized
  }

  try {
    // Initialize the protocol config with new subscription parameters
    await ctx.molphaProgram.methods
      .initializeProtocol(new anchor.BN(1000)) // Legacy fee_per_update
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Update protocol config with new subscription parameters
    // Note: This would require a new instruction in the program to update these fields
    // For now, we'll use the default values from the struct
  } catch (e) {
    // Ignore if already initialized
  }
}

// Test signature for EIP-712 verification tests
export const testSignature =
  "0xb8b5718dedd6ba74f754a35ec92064a30443559e7f8b2e5d2b43f3b56147014d4c328a3a482feaebd969bd501975a81676feea6ca313bfebea18fff4f3d1e9e51c";

// Helper functions for creating test data sources
export function createTestDataSourceInfo(
  dataSourceType: number,
  source: string,
  owner: string,
  name: string,
  signature: string
) {
  const recoveryId = parseInt(signature.slice(-2), 16) - 27;
  const sigWithoutRecoveryId = Buffer.from(signature.slice(2, -2), "hex");
  const sigWithSolanaRecoveryId = Buffer.concat([
    sigWithoutRecoveryId,
    Buffer.from([recoveryId]),
  ]);

  // Use proper discriminated union format for the enum
  const dataSourceTypeEnum =
    dataSourceType === 1 ? { private: {} } : { public: {} };

  return {
    dataSourceType: dataSourceTypeEnum,
    source: source,
    ownerEth: Array.from(Buffer.from(owner.slice(2), "hex")),
    name: name,
    sig: Array.from(sigWithSolanaRecoveryId),
  };
}

// Helper function to create feed parameters
export function createFeedParams(
  jobId: string,
  feedType: { public: {} } | { personal: {} },
  dataSourceId: Uint8Array
) {
  return {
    name: jobId,
    dataSourceId: Array.from(dataSourceId),
    jobId: Array.from(Buffer.from(jobId.padEnd(32, "\0"))),
    feedType: feedType,
    minSignaturesThreshold: 2,
    frequency: new anchor.BN(300), // 5 minutes as BN
    ipfsCid: "QmTestCID123456789",
  };
}

export function buildEIP712Domain(name: string, version: string) {
  // Use hardcoded DOMAIN_SEPARATOR from DataSourceRegistry.sol
  // bytes32 private constant DOMAIN_SEPARATOR = 0x91af22df910089dce34bc41d0790bb4a1beee77dda588667c082bb964143739f;
  return Buffer.from([
    0x91, 0xaf, 0x22, 0xdf, 0x91, 0x00, 0x89, 0xdc, 0xe3, 0x4b, 0xc4, 0x1d,
    0x07, 0x90, 0xbb, 0x4a, 0x1b, 0xee, 0xe7, 0x7d, 0xda, 0x58, 0x86, 0x67,
    0xc0, 0x82, 0xbb, 0x96, 0x41, 0x43, 0x73, 0x9f,
  ]);
}

export function buildDataSourceStructHash(data: any) {
  const typeHash = Buffer.from(
    ethers
      .keccak256(
        Buffer.from(
          "DataSource(uint8 type,string source,address owner,string name)"
        )
      )
      .slice(2),
    "hex"
  );

  const sourceHash = Buffer.from(
    ethers.keccak256(Buffer.from(data.source)).slice(2),
    "hex"
  );
  const nameHash = Buffer.from(
    ethers.keccak256(Buffer.from(data.name)).slice(2),
    "hex"
  );

  // Pad owner address to 32 bytes
  const ownerEthPadded = Buffer.alloc(32);
  Buffer.from(data.owner.slice(2), "hex").copy(ownerEthPadded, 12);

  // Pad dataSourceType to 32 bytes
  const dataSourceTypeBytes = Buffer.alloc(32);
  dataSourceTypeBytes[31] = data.dataSourceType;

  // Match Solidity parameter order: (type, source, owner, name)
  return Buffer.from(
    ethers
      .keccak256(
        Buffer.concat([
          typeHash,
          dataSourceTypeBytes,
          sourceHash,
          ownerEthPadded,
          nameHash,
        ])
      )
      .slice(2),
    "hex"
  );
}

export function buildEthLinkStructHash(data: any) {
  const typeHash = Buffer.from(
    ethers
      .keccak256(Buffer.from("PermitGrantee(address ownerEth,bytes32 grantee)"))
      .slice(2),
    "hex"
  );

  // Pad owner address to 32 bytes
  const ownerEthPadded = Buffer.alloc(32);
  Buffer.from(data.owner.slice(2), "hex").copy(ownerEthPadded, 12);

  // Convert grantee (Solana public key) to bytes32
  const granteePublicKey = new PublicKey(data.grantee);
  const granteeBytes = granteePublicKey.toBuffer();
  const granteePadded = Buffer.alloc(32);
  granteeBytes.copy(granteePadded, 0);

  return Buffer.from(
    ethers
      .keccak256(Buffer.concat([typeHash, ownerEthPadded, granteePadded]))
      .slice(2),
    "hex"
  );
}

export function buildEIP712Digest(
  domainSeparator: Uint8Array,
  structHash: Uint8Array
) {
  return Buffer.from(
    ethers
      .keccak256(
        Buffer.concat([Buffer.from("\x19\x01"), domainSeparator, structHash])
      )
      .slice(2),
    "hex"
  );
}

export function computeDataSourceId(data: any) {
  const serialized = Buffer.concat([
    Buffer.from([data.dataSourceType]),
    Buffer.from(data.source || ""),
    Buffer.from(data.ownerEth.slice(2), "hex"),
    Buffer.from(data.name),
  ]);
  return Buffer.from(ethers.keccak256(serialized).slice(2), "hex");
}

// Generate a keypair and sign data for testing
export function generateTestSignature(
  dataSourceType: number,
  source: string,
  name: string
) {
  // Generate a random Ethereum-style keypair
  const wallet = ethers.Wallet.createRandom();
  const privateKey = wallet.privateKey;
  const address = wallet.address;

  // Build the EIP-712 domain separator
  const domainSeparator = buildEIP712Domain("Molpha Oracles", "1");

  // Build the struct hash for the data source
  const structHash = buildDataSourceStructHash({
    dataSourceType,
    source,
    owner: address,
    name,
  });

  // Build the final digest
  const digest = buildEIP712Digest(domainSeparator, structHash);

  // Sign the digest
  const signingKey = new ethers.SigningKey(privateKey);
  const signature = signingKey.sign(digest);

  // Convert to the format expected by the program (r + s + v)
  const r = signature.r.slice(2); // Remove 0x prefix
  const s = signature.s.slice(2); // Remove 0x prefix
  const v = signature.v.toString(16).padStart(2, "0"); // Convert v to hex

  const fullSignature = `0x${r}${s}${v}`;

  return {
    signature: fullSignature,
    address: address,
    privateKey: privateKey,
  };
}

// Generate a keypair and sign permit data for testing
export function generatePermitSignature(grantee: string) {
  // Generate a random Ethereum-style keypair
  const wallet = ethers.Wallet.createRandom();
  const privateKey = wallet.privateKey;
  const address = wallet.address;

  // Build the EIP-712 domain separator
  const domainSeparator = buildEIP712Domain("Molpha Oracles", "1");

  // Build the struct hash for the permit
  const structHash = buildEthLinkStructHash({
    owner: address,
    grantee: grantee,
  });

  // Build the final digest
  const digest = buildEIP712Digest(domainSeparator, structHash);

  // Sign the digest
  const signingKey = new ethers.SigningKey(privateKey);
  const signature = signingKey.sign(digest);

  // Convert to the format expected by the program (r + s + v)
  const r = signature.r.slice(2); // Remove 0x prefix
  const s = signature.s.slice(2); // Remove 0x prefix
  const v = signature.v.toString(16).padStart(2, "0"); // Convert v to hex

  const fullSignature = `0x${r}${s}${v}`;

  return {
    signature: fullSignature,
    address: address,
    privateKey: privateKey,
  };
}
