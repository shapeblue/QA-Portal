#!/bin/bash

echo "==================================="
echo "Testing Production Deployment"
echo "==================================="
echo ""

# Test 1: Check if we can reach the server
echo "[1/4] Testing network connectivity..."
if ping -c 1 -W 2 10.0.113.145 > /dev/null 2>&1; then
    echo "✅ Server is reachable"
else
    echo "❌ Cannot reach server"
    exit 1
fi
echo ""

# Test 2: Check SSH access (will prompt for password if no key)
echo "[2/4] Testing SSH access..."
echo "This will prompt for password if SSH key is not set up."
echo ""
ssh -o ConnectTimeout=5 root@10.0.113.145 'echo "SSH connection successful"; hostname; whoami; pwd'
SSH_STATUS=$?

if [ $SSH_STATUS -eq 0 ]; then
    echo ""
    echo "✅ SSH access working"
else
    echo ""
    echo "❌ SSH authentication failed"
    echo ""
    echo "To set up SSH key authentication:"
    echo "  ssh-copy-id root@10.0.113.145"
    exit 1
fi
echo ""

# Test 3: Check if QA-Portal exists on server
echo "[3/4] Checking if QA-Portal is on server..."
ssh root@10.0.113.145 'test -d /root/QA-Portal && echo "✅ /root/QA-Portal exists" || echo "❌ /root/QA-Portal not found"'
echo ""

# Test 4: Check current version on server
echo "[4/4] Checking current version on server..."
ssh root@10.0.113.145 'cd /root/QA-Portal && git branch --show-current && git log -1 --oneline'
echo ""

echo "==================================="
echo "Pre-deployment check complete!"
echo "==================================="
echo ""
echo "Ready to deploy with: ./scripts/deploy.sh --skip-tests"
