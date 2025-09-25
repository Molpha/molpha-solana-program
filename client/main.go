package main

import (
	"context"
	"crypto/ed25519"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/mr-tron/base58"
)

// Program IDs - these should match your deployed programs
var (
	NodeRegistryProgramID = solana.MustPublicKeyFromBase58("Dc2MnNey7J22vDgUByhFstqWNYiQmntqqRFwrfDibnKR")
	FeedProgramID         = solana.MustPublicKeyFromBase58("3DeVEWmqHT1QvnWmbtobw42XUkqFFtFU2guJ4Rn1Mbf2")
)

// Answer represents the oracle answer structure
type Answer struct {
	Value     [32]byte `json:"value"`
	Timestamp int64    `json:"timestamp"`
}

// OracleClient represents the oracle client
type OracleClient struct {
	rpcClient    *rpc.Client
	nodeKeypairs []solana.PrivateKey // Changed to slice to support multiple nodes
	payerKey     solana.PrivateKey
}

// NewOracleClient creates a new oracle client with multiple nodes
func NewOracleClient(rpcEndpoint string, nodePrivateKeys []string, payerPrivateKey string) (*OracleClient, error) {
	client := rpc.New(rpcEndpoint)

	// Decode multiple node private keys
	nodeKeypairs := make([]solana.PrivateKey, len(nodePrivateKeys))
	for i, nodePrivateKey := range nodePrivateKeys {
		nodeKeyBytes, err := base58.Decode(nodePrivateKey)
		if err != nil {
			return nil, fmt.Errorf("failed to decode node private key %d: %v", i, err)
		}
		nodeKeypairs[i] = solana.PrivateKey(nodeKeyBytes)
	}

	// Decode the payer private key
	payerKeyBytes, err := base58.Decode(payerPrivateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decode payer private key: %v", err)
	}
	payerKey := solana.PrivateKey(payerKeyBytes)

	return &OracleClient{
		rpcClient:    client,
		nodeKeypairs: nodeKeypairs,
		payerKey:     payerKey,
	}, nil
}

// GenerateKeypair generates a new Ed25519 keypair for oracle nodes
func GenerateKeypair() (solana.PrivateKey, solana.PublicKey) {
	account := solana.NewWallet()
	return account.PrivateKey, account.PublicKey()
}

// SignMessage signs a message with a specific node's private key
func (oc *OracleClient) SignMessage(message []byte, nodeIndex int) []byte {
	if nodeIndex >= len(oc.nodeKeypairs) {
		panic(fmt.Sprintf("Invalid node index: %d", nodeIndex))
	}
	signature := ed25519.Sign(ed25519.PrivateKey(oc.nodeKeypairs[nodeIndex]), message)
	return signature
}

// CreateEd25519VerifyInstruction creates an Ed25519 signature verification instruction for a specific node
func (oc *OracleClient) CreateEd25519VerifyInstruction(message []byte, signature []byte, nodeIndex int) solana.Instruction {
	// Ed25519 instruction data format according to Solana specs
	// Header (16 bytes) + signature (64 bytes) + pubkey (32 bytes) + message

	if nodeIndex >= len(oc.nodeKeypairs) {
		panic(fmt.Sprintf("Invalid node index: %d", nodeIndex))
	}
	pubkey := oc.nodeKeypairs[nodeIndex].PublicKey()

	// Calculate offsets
	headerSize := uint16(16)
	signatureOffset := headerSize
	pubkeyOffset := signatureOffset + 64
	messageOffset := pubkeyOffset + 32
	messageSize := uint16(len(message))

	// Build instruction data
	data := make([]byte, 16+64+32+len(message))

	// Header
	data[0] = 1                                               // num_signatures
	data[1] = 0                                               // padding
	binary.LittleEndian.PutUint16(data[2:4], signatureOffset) // signature_offset
	binary.LittleEndian.PutUint16(data[4:6], 0)               // signature_instruction_index (same instruction)
	binary.LittleEndian.PutUint16(data[6:8], pubkeyOffset)    // public_key_offset
	binary.LittleEndian.PutUint16(data[8:10], 0)              // public_key_instruction_index (same instruction)
	binary.LittleEndian.PutUint16(data[10:12], messageOffset) // message_data_offset
	binary.LittleEndian.PutUint16(data[12:14], messageSize)   // message_data_size
	binary.LittleEndian.PutUint16(data[14:16], 0)             // message_instruction_index (same instruction)

	// Payload
	copy(data[signatureOffset:], signature)
	copy(data[pubkeyOffset:], pubkey[:])
	copy(data[messageOffset:], message)

	return solana.NewInstruction(
		solana.MustPublicKeyFromBase58("Ed25519SigVerify111111111111111111111111111"),
		solana.AccountMetaSlice{},
		data,
	)
}

// PublishAnswer publishes an oracle answer to the feed with multiple node signatures
func (oc *OracleClient) PublishAnswer(feedID string, feedAuthority solana.PublicKey, answer Answer, minSignatures uint8) error {
	ctx := context.Background()

	// Validate that we have enough nodes to meet the minimum signature requirement
	if len(oc.nodeKeypairs) < int(minSignatures) {
		return fmt.Errorf("not enough nodes (%d) to meet minimum signature requirement (%d)", len(oc.nodeKeypairs), minSignatures)
	}

	// Create message to sign (this should match your oracle's message format)
	messageData := struct {
		FeedID    string `json:"feed_id"`
		Value     string `json:"value"`
		Timestamp int64  `json:"timestamp"`
	}{
		FeedID:    feedID,
		Value:     base58.Encode(answer.Value[:]),
		Timestamp: answer.Timestamp,
	}

	messageBytes, err := json.Marshal(messageData)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %v", err)
	}

	// Create Ed25519 verification instructions for all nodes
	var ed25519Instructions []solana.Instruction
	for i := 0; i < len(oc.nodeKeypairs); i++ {
		// Sign the message with each node
		signature := oc.SignMessage(messageBytes, i)

		// Create Ed25519 verification instruction for this node
		ed25519Instruction := oc.CreateEd25519VerifyInstruction(messageBytes, signature, i)
		ed25519Instructions = append(ed25519Instructions, ed25519Instruction)
	}

	// Find PDAs
	nodeRegistryPDA, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("node-registry")},
		NodeRegistryProgramID,
	)
	if err != nil {
		return fmt.Errorf("failed to find node registry PDA: %v", err)
	}

	feedAccountPDA, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("feed"),
			feedAuthority[:],
			[]byte(feedID),
		},
		FeedProgramID,
	)
	if err != nil {
		return fmt.Errorf("failed to find feed account PDA: %v", err)
	}

	protocolConfigPDA, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("config")},
		FeedProgramID,
	)
	if err != nil {
		return fmt.Errorf("failed to find protocol config PDA: %v", err)
	}

	// For now, assume the payer is also the consumer (subscription owner)
	consumer := oc.payerKey.PublicKey()
	subscriptionPDA, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("subscription"),
			consumer[:],
			feedAccountPDA[:],
		},
		FeedProgramID,
	)
	if err != nil {
		return fmt.Errorf("failed to find subscription PDA: %v", err)
	}

	// Create verify_signatures instruction data
	verifyData := make([]byte, 0)

	// Instruction discriminator for verify_signatures (8 bytes)
	// From the IDL: [147, 53, 25, 146, 20, 29, 35, 90]
	discriminator := []byte{147, 53, 25, 146, 20, 29, 35, 90}
	verifyData = append(verifyData, discriminator...)

	// Serialize message length and data
	messageLen := make([]byte, 4)
	binary.LittleEndian.PutUint32(messageLen, uint32(len(messageBytes)))
	verifyData = append(verifyData, messageLen...)
	verifyData = append(verifyData, messageBytes...)

	// Serialize min_signatures_threshold
	verifyData = append(verifyData, minSignatures)

	// Serialize Answer struct
	verifyData = append(verifyData, answer.Value[:]...)
	timestampBytes := make([]byte, 8)
	binary.LittleEndian.PutUint64(timestampBytes, uint64(answer.Timestamp))
	verifyData = append(verifyData, timestampBytes...)

	// Create verify_signatures instruction
	verifyInstruction := solana.NewInstruction(
		NodeRegistryProgramID,
		solana.AccountMetaSlice{
			{PublicKey: nodeRegistryPDA, IsWritable: false, IsSigner: false},
			{PublicKey: feedAccountPDA, IsWritable: true, IsSigner: false},
			{PublicKey: FeedProgramID, IsWritable: false, IsSigner: false},
			{PublicKey: subscriptionPDA, IsWritable: true, IsSigner: false},
			{PublicKey: protocolConfigPDA, IsWritable: false, IsSigner: false},
			{PublicKey: solana.SysVarInstructionsPubkey, IsWritable: false, IsSigner: false},
		},
		verifyData,
	)

	// Get latest blockhash (GetRecentBlockhash is deprecated)
	recent, err := oc.rpcClient.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		return fmt.Errorf("failed to get latest blockhash: %v", err)
	}

	// Build the complete instruction list: all Ed25519 instructions + verify_signatures instruction
	allInstructions := append(ed25519Instructions, verifyInstruction)

	// Create transaction
	tx, err := solana.NewTransaction(
		allInstructions,
		recent.Value.Blockhash,
		solana.TransactionPayer(oc.payerKey.PublicKey()),
	)
	if err != nil {
		return fmt.Errorf("failed to create transaction: %v", err)
	}

	// Sign transaction
	_, err = tx.Sign(func(key solana.PublicKey) *solana.PrivateKey {
		if key.Equals(oc.payerKey.PublicKey()) {
			return &oc.payerKey
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to sign transaction: %v", err)
	}

	// Send transaction
	sig, err := oc.rpcClient.SendTransaction(ctx, tx)
	if err != nil {
		return fmt.Errorf("failed to send transaction: %v", err)
	}

	fmt.Printf("Transaction sent with %d node signatures: %s\n", len(oc.nodeKeypairs), sig)

	// Wait for confirmation
	return oc.waitForConfirmation(ctx, sig)
}

// waitForConfirmation waits for transaction confirmation
func (oc *OracleClient) waitForConfirmation(ctx context.Context, signature solana.Signature) error {
	for i := 0; i < 30; i++ { // Wait up to 30 seconds
		status, err := oc.rpcClient.GetSignatureStatuses(ctx, true, signature)
		if err != nil {
			return fmt.Errorf("failed to get signature status: %v", err)
		}

		if len(status.Value) > 0 && status.Value[0] != nil {
			if status.Value[0].ConfirmationStatus == rpc.ConfirmationStatusFinalized {
				fmt.Printf("Transaction confirmed: %s\n", signature)
				return nil
			}
		}

		time.Sleep(1 * time.Second)
	}

	return fmt.Errorf("transaction not confirmed within timeout")
}

// parseUint8 safely parses a string to uint8
func parseUint8(s string) uint8 {
	if val, err := strconv.ParseUint(s, 10, 8); err == nil {
		return uint8(val)
	}
	return 0
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage:")
		fmt.Println("  generate-keypair                           - Generate a new keypair")
		fmt.Println("  publish <feed_id> <value> <node_key1[,node_key2,...]> <payer_private_key> [feed_authority_key] - Publish oracle data with multiple node signatures")
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "generate-keypair":
		privateKey, publicKey := GenerateKeypair()
		fmt.Printf("Private Key: %s\n", base58.Encode(privateKey))
		fmt.Printf("Public Key: %s\n", publicKey.String())

	case "publish":
		if len(os.Args) < 6 {
			fmt.Println("Usage: publish <feed_id> <value> <node_key1[,node_key2,...]> <payer_private_key> [feed_authority_key]")
			fmt.Println("Examples:")
			fmt.Println("  Single node:    publish feed1 hello node_key payer_key")
			fmt.Println("  Multiple nodes: publish feed1 hello node_key1,node_key2,node_key3 payer_key")
			os.Exit(1)
		}

		feedID := os.Args[2]
		value := os.Args[3]
		nodeKeysStr := os.Args[4]
		payerKey := os.Args[5]

		// Parse multiple node keys (comma-separated)
		nodeKeys := strings.Split(nodeKeysStr, ",")
		if len(nodeKeys) == 0 {
			log.Fatalf("At least one node key is required")
		}

		// Clean up the node keys (remove whitespace)
		for i := range nodeKeys {
			nodeKeys[i] = strings.TrimSpace(nodeKeys[i])
			if nodeKeys[i] == "" {
				log.Fatalf("Empty node key found at position %d", i)
			}
		}

		// Default to payer as feed authority if not provided
		authorityKey := payerKey
		if len(os.Args) > 6 {
			authorityKey = os.Args[6]
		}

		// Parse authority public key
		authorityPubkey, err := solana.PublicKeyFromBase58(authorityKey)
		if err != nil {
			// If it's not a public key, assume it's a private key and derive the public key
			authorityKeyBytes, err := base58.Decode(authorityKey)
			if err != nil {
				log.Fatalf("Failed to parse authority key: %v", err)
			}
			authorityPrivKey := solana.PrivateKey(authorityKeyBytes)
			authorityPubkey = authorityPrivKey.PublicKey()
		}

		// Create client with multiple nodes
		client, err := NewOracleClient("http://127.0.0.1:8899", nodeKeys, payerKey)
		if err != nil {
			log.Fatalf("Failed to create client: %v", err)
		}

		// Create answer
		var valueBytes [32]byte
		valueData, err := base58.Decode(value)
		if err != nil {
			// If not base58, treat as string and hash/pad it
			copy(valueBytes[:], []byte(value))
		} else {
			copy(valueBytes[:], valueData)
		}

		answer := Answer{
			Value:     valueBytes,
			Timestamp: time.Now().Unix() - 30, // Subtract 30 seconds to ensure it's in the past relative to validator clock
		}

		// Calculate minimum signatures needed
		minSignatures := uint8(len(nodeKeys)) // Default: require all nodes to sign

		// Allow override via environment variable for testing
		if minSigStr := os.Getenv("MIN_SIGNATURES"); minSigStr != "" {
			if minSig := parseUint8(minSigStr); minSig > 0 && minSig <= uint8(len(nodeKeys)) {
				minSignatures = minSig
			}
		}

		fmt.Printf("Publishing answer with %d node signatures (minimum required: %d)...\n", len(nodeKeys), minSignatures)

		// Publish answer
		err = client.PublishAnswer(feedID, authorityPubkey, answer, minSignatures)
		if err != nil {
			log.Fatalf("Failed to publish answer: %v", err)
		}

		fmt.Println("Answer published successfully!")

	default:
		fmt.Printf("Unknown command: %s\n", command)
		os.Exit(1)
	}
}
