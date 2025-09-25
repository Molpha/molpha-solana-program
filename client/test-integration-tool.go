package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/mr-tron/base58"
)

// This is a simple integration test utility
// Run with: go run test-integration.go <payer_private_key>
// Make sure you have:
// 1. A running Solana validator
// 2. Deployed oracle programs
// 3. Initialized NodeRegistry and ProtocolConfig

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run test-integration.go <payer_private_key>")
		fmt.Println("This will:")
		fmt.Println("1. Generate a new node keypair")
		fmt.Println("2. Check if programs are deployed")
		fmt.Println("3. Show the steps needed to complete the integration")
		os.Exit(1)
	}

	payerKeyStr := os.Args[1]

	// Create RPC client
	client := rpc.New("http://127.0.0.1:8899")
	ctx := context.Background()

	// Decode payer key
	payerKeyBytes, err := base58.Decode(payerKeyStr)
	if err != nil {
		log.Fatalf("Failed to decode payer key: %v", err)
	}
	payerKey := solana.PrivateKey(payerKeyBytes)
	payerPubkey := payerKey.PublicKey()

	fmt.Printf("=== Oracle Integration Test ===\n")
	fmt.Printf("Payer: %s\n\n", payerPubkey)

	// Check payer balance
	balance, err := client.GetBalance(ctx, payerPubkey, rpc.CommitmentFinalized)
	if err != nil {
		log.Fatalf("Failed to get payer balance: %v", err)
	}
	fmt.Printf("Payer balance: %f SOL\n", float64(balance.Value)/1e9)
	if balance.Value < 1e8 { // Less than 0.1 SOL
		fmt.Printf("⚠️  Warning: Low balance. You may need more SOL for transactions.\n")
	}
	fmt.Println()

	// Generate node keypair
	nodeAccount := solana.NewWallet()
	nodePrivateKey := nodeAccount.PrivateKey
	nodePublicKey := nodeAccount.PublicKey()

	fmt.Printf("Generated Node Keypair:\n")
	fmt.Printf("Private Key: %s\n", base58.Encode(nodePrivateKey))
	fmt.Printf("Public Key: %s\n\n", nodePublicKey)

	// Check if programs exist
	nodeRegistryProgramID := solana.MustPublicKeyFromBase58("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS")
	feedProgramID := solana.MustPublicKeyFromBase58("GRguUVXULUZzYdhWBSmWVhkKNnL3zRAXagiK3XfTnAbu")

	fmt.Printf("Checking program deployments...\n")

	// Check NodeRegistry program
	nodeRegistryAccount, err := client.GetAccountInfo(ctx, nodeRegistryProgramID)
	if err != nil || nodeRegistryAccount.Value == nil {
		fmt.Printf("❌ NodeRegistry program not found at %s\n", nodeRegistryProgramID)
	} else {
		fmt.Printf("✅ NodeRegistry program found\n")
	}

	// Check Feed program
	feedAccount, err := client.GetAccountInfo(ctx, feedProgramID)
	if err != nil || feedAccount.Value == nil {
		fmt.Printf("❌ Feed program not found at %s\n", feedProgramID)
	} else {
		fmt.Printf("✅ Feed program found\n")
	}
	fmt.Println()

	// Check if NodeRegistry is initialized
	nodeRegistryPDA, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("node-registry")},
		nodeRegistryProgramID,
	)
	if err != nil {
		log.Fatalf("Failed to find NodeRegistry PDA: %v", err)
	}

	nodeRegistryData, err := client.GetAccountInfo(ctx, nodeRegistryPDA)
	if err != nil || nodeRegistryData.Value == nil {
		fmt.Printf("❌ NodeRegistry not initialized at %s\n", nodeRegistryPDA)
		fmt.Printf("   Run: anchor run initialize\n")
	} else {
		fmt.Printf("✅ NodeRegistry initialized at %s\n", nodeRegistryPDA)
	}

	// Check if ProtocolConfig is initialized
	protocolConfigPDA, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("config")},
		feedProgramID,
	)
	if err != nil {
		log.Fatalf("Failed to find ProtocolConfig PDA: %v", err)
	}

	protocolConfigData, err := client.GetAccountInfo(ctx, protocolConfigPDA)
	if err != nil || protocolConfigData.Value == nil {
		fmt.Printf("❌ ProtocolConfig not initialized at %s\n", protocolConfigPDA)
		fmt.Printf("   Run: anchor run initialize-protocol\n")
	} else {
		fmt.Printf("✅ ProtocolConfig initialized at %s\n", protocolConfigPDA)
	}
	fmt.Println()

	// Instructions for completing the setup
	fmt.Printf("=== Next Steps ===\n")
	fmt.Printf("1. Add the node to the registry:\n")
	fmt.Printf("   anchor run add-node -- %s\n\n", nodePublicKey)

	fmt.Printf("2. Create a test feed:\n")
	fmt.Printf("   anchor run create-feed -- \"BTC-USD-TEST\"\n\n")

	fmt.Printf("3. If using a personal feed, create and fund a subscription:\n")
	fmt.Printf("   anchor run subscribe -- \"BTC-USD-TEST\"\n")
	fmt.Printf("   anchor run top-up -- \"BTC-USD-TEST\" 1000000\n\n")

	fmt.Printf("4. Test the oracle client:\n")
	fmt.Printf("   ./oracle-client publish \"BTC-USD-TEST\" \"50000\" \"%s\" \"%s\"\n\n",
		base58.Encode(nodePrivateKey), payerKeyStr)

	fmt.Printf("=== Multi-Node Test ===\n")
	fmt.Printf("To test multi-signature validation:\n")
	fmt.Printf("1. Generate multiple node keypairs\n")
	fmt.Printf("2. Register all nodes in the NodeRegistry\n")
	fmt.Printf("3. Use a tool like the JavaScript client to create a transaction with multiple Ed25519 instructions\n")
	fmt.Printf("4. Set min_signatures_threshold > 1 when calling verify_signatures\n\n")

	fmt.Printf("=== Monitoring ===\n")
	fmt.Printf("Monitor transactions with:\n")
	fmt.Printf("  solana logs\n")
	fmt.Printf("Or check specific accounts:\n")
	fmt.Printf("  solana account %s  # NodeRegistry\n", nodeRegistryPDA)
	fmt.Printf("  solana account %s  # ProtocolConfig\n", protocolConfigPDA)
}
