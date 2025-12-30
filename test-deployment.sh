#!/bin/bash

echo "==================================="
echo "Testing Production Deployment"
echo "==================================="
echo ""

# Test 1: Check if we can reach the server
echo "[1/5] Testing network connectivity..."
if ping -c 1 -W 2 10.0.113.145 > /dev/null 2>&1; then
    echo "✅ Server is reachable"
else
    echo "❌ Cannot reach server"
    exit 1
fi
echo ""

# Test 2: Check if backend server is running (critical test first)
echo "[2/5] Checking if backend server is running..."
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://10.0.113.145/api/health 2>/dev/null)
if [ "$HEALTH_CHECK" = "200" ]; then
    echo "✅ Backend server is running"
    BACKEND_RUNNING=true
elif [ "$HEALTH_CHECK" = "502" ] || [ "$HEALTH_CHECK" = "000" ]; then
    echo "❌ Backend server is NOT running (HTTP $HEALTH_CHECK)"
    BACKEND_RUNNING=false
else
    echo "⚠️  Backend server returned unexpected status: HTTP $HEALTH_CHECK"
    BACKEND_RUNNING=false
fi
echo ""

# Test 3: Check frontend
echo "[3/5] Checking if frontend is accessible..."
FRONTEND_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://10.0.113.145/ 2>/dev/null)
if [ "$FRONTEND_CHECK" = "200" ]; then
    echo "✅ Frontend is serving"
else
    echo "⚠️  Frontend returned HTTP $FRONTEND_CHECK"
fi
echo ""

# Test 4: Check SSH access (will prompt for password if no key)
echo "[4/5] Testing SSH access..."
echo "This will prompt for password if SSH key is not set up."
echo ""
ssh -o ConnectTimeout=5 -o BatchMode=yes root@10.0.113.145 'echo "SSH connection successful"; hostname; whoami; pwd' 2>/dev/null
SSH_STATUS=$?

if [ $SSH_STATUS -eq 0 ]; then
    echo ""
    echo "✅ SSH access working"
    
    # Test 5: Check if QA-Portal exists on server
    echo ""
    echo "[5/5] Checking QA-Portal on server..."
    ssh root@10.0.113.145 'test -d /root/QA-Portal && echo "✅ /root/QA-Portal exists" || echo "❌ /root/QA-Portal not found"'
    ssh root@10.0.113.145 'cd /root/QA-Portal && echo "Current branch: $(git branch --show-current)" && git log -1 --oneline'
else
    echo ""
    echo "⚠️  SSH authentication failed (no SSH key configured)"
    echo ""
    echo "To set up SSH key authentication:"
    echo "  ssh-copy-id root@10.0.113.145"
    echo ""
    echo "[5/5] Skipping server file checks (requires SSH)"
fi
echo ""

# Final summary
echo "==================================="
if [ "$BACKEND_RUNNING" = true ]; then
    echo "✅ Deployment Status: HEALTHY"
    echo "==================================="
    echo ""
    echo "All systems operational!"
else
    echo "❌ Deployment Status: FAILED"
    echo "==================================="
    echo ""
    echo "CRITICAL ISSUE: Backend server is not running!"
    echo ""
    echo "To fix this issue:"
    echo "  1. SSH to server: ssh root@10.0.113.145"
    echo "  2. Check server status: pm2 list"
    echo "  3. Check server logs: tail -f /tmp/qa-server.log"
    echo "  4. Restart server: cd /root/QA-Portal/server && pm2 start dist/index.js --name qa-portal-api"
    exit 1
fi
echo ""
echo "Ready to deploy with: ./scripts/deploy.sh --skip-tests"
