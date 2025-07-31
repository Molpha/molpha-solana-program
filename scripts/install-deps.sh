#!/bin/bash

# Install dependencies for Molpha Oracle testing environment

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Install Node.js dependencies
install_node_deps() {
    log_info "Installing Node.js dependencies..."
    
    if command -v yarn &> /dev/null; then
        yarn install
        yarn add bs58  # For keypair conversion
    elif command -v npm &> /dev/null; then
        npm install
        npm install bs58
    else
        log_error "Neither yarn nor npm found. Please install Node.js first."
        return 1
    fi
    
    log_success "Node.js dependencies installed"
}

# Install Python dependencies (fallback for keypair conversion)
install_python_deps() {
    log_info "Installing Python dependencies (optional)..."
    
    if command -v python3 &> /dev/null; then
        if command -v pip3 &> /dev/null; then
            pip3 install base58 --user || log_warning "Failed to install Python base58 (optional)"
        else
            log_warning "pip3 not found, skipping Python dependencies"
        fi
    else
        log_warning "Python3 not found, skipping Python dependencies"
    fi
}

# Check Go installation
check_go() {
    log_info "Checking Go installation..."
    
    if command -v go &> /dev/null; then
        GO_VERSION=$(go version | cut -d' ' -f3)
        log_success "Go found: $GO_VERSION"
    else
        log_error "Go not found. Please install Go 1.21 or later."
        log_info "Visit: https://golang.org/doc/install"
        return 1
    fi
}

# Check Solana CLI
check_solana() {
    log_info "Checking Solana CLI..."
    
    if command -v solana &> /dev/null; then
        SOLANA_VERSION=$(solana --version | cut -d' ' -f2)
        log_success "Solana CLI found: $SOLANA_VERSION"
    else
        log_error "Solana CLI not found. Please install it first."
        log_info "Visit: https://docs.solana.com/cli/install-solana-cli-tools"
        return 1
    fi
}

# Check Anchor CLI
check_anchor() {
    log_info "Checking Anchor CLI..."
    
    if command -v anchor &> /dev/null; then
        ANCHOR_VERSION=$(anchor --version | cut -d' ' -f3)
        log_success "Anchor CLI found: $ANCHOR_VERSION"
    else
        log_error "Anchor CLI not found. Please install it first."
        log_info "Visit: https://www.anchor-lang.com/docs/installation"
        return 1
    fi
}

# Main installation
main() {
    echo -e "${BLUE}=== Molpha Oracle Dependencies Installation ===${NC}"
    echo
    
    # Check required tools
    check_go
    check_solana  
    check_anchor
    
    echo
    
    # Install dependencies
    install_node_deps
    install_python_deps
    
    echo
    log_success "🎉 Dependencies installation completed!"
    echo
    log_info "Next steps:"
    echo "1. Run the setup script:  ./scripts/setup-local-env.sh"
    echo "2. Test the Go client:    ./scripts/test-go-client-simple.sh"
    echo
}

main "$@" 