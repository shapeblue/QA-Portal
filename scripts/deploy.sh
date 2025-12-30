#!/bin/bash

###############################################################################
# QA Portal Deployment Script
#
# This script deploys changes from your local machine to the production server.
#
# Usage:
#   ./scripts/deploy.sh [options]
#
# Options:
#   --skip-tests    Skip running tests before deployment
#   --branch NAME   Deploy specific branch (default: current branch)
#   --no-restart    Don't restart services after deployment
#
# Requirements:
#   - SSH access to production server
#   - Git configured with push access
#   - Node.js and npm installed locally
#
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PRODUCTION_SERVER="root@10.0.113.145"  # Update with your server
PRODUCTION_PATH="/root/QA-Portal"
SKIP_TESTS=false
NO_RESTART=false
BRANCH=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --branch)
            BRANCH="$2"
            shift 2
            ;;
        --no-restart)
            NO_RESTART=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-tests    Skip running tests"
            echo "  --branch NAME   Deploy specific branch"
            echo "  --no-restart    Don't restart services"
            echo "  -h, --help      Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Get current branch if not specified
if [ -z "$BRANCH" ]; then
    BRANCH=$(git branch --show-current)
fi

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}QA Portal Deployment Script${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""
echo -e "${YELLOW}Branch:${NC} $BRANCH"
echo -e "${YELLOW}Server:${NC} $PRODUCTION_SERVER"
echo ""

# Step 1: Check for uncommitted changes
echo -e "${BLUE}[1/7] Checking for uncommitted changes...${NC}"
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}You have uncommitted changes:${NC}"
    git status -s
    echo ""
    read -p "Do you want to commit these changes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter commit message: " COMMIT_MSG
        git add .
        git commit -m "$COMMIT_MSG"
        echo -e "${GREEN}✓ Changes committed${NC}"
    else
        echo -e "${RED}✗ Please commit or stash your changes before deploying${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ No uncommitted changes${NC}"
fi
echo ""

# Step 2: Run tests (unless skipped)
if [ "$SKIP_TESTS" = false ]; then
    echo -e "${BLUE}[2/7] Running tests...${NC}"
    
    # Run client tests
    if [ -d "client" ]; then
        echo "Running frontend tests..."
        cd client
        npm test -- --watchAll=false --passWithNoTests || {
            echo -e "${RED}✗ Frontend tests failed${NC}"
            exit 1
        }
        cd ..
    fi
    
    # Run linter
    if [ -d "client" ]; then
        echo "Running linter..."
        cd client
        npm run lint || {
            echo -e "${RED}✗ Linting failed${NC}"
            exit 1
        }
        cd ..
    fi
    
    echo -e "${GREEN}✓ All tests passed${NC}"
else
    echo -e "${YELLOW}[2/7] Skipping tests${NC}"
fi
echo ""

# Step 3: Push to GitHub
echo -e "${BLUE}[3/7] Pushing to GitHub...${NC}"
git push origin $BRANCH || {
    echo -e "${RED}✗ Failed to push to GitHub${NC}"
    exit 1
}
echo -e "${GREEN}✓ Pushed to GitHub${NC}"
echo ""

# Step 4: SSH to server and pull changes
echo -e "${BLUE}[4/7] Pulling changes on production server...${NC}"
ssh $PRODUCTION_SERVER << ENDSSH
    set -e
    cd $PRODUCTION_PATH
    
    echo "Current branch: \$(git branch --show-current)"
    echo "Pulling latest changes..."
    
    # Stash any local changes (shouldn't be any, but just in case)
    git stash
    
    # Fetch and checkout branch
    git fetch origin
    git checkout $BRANCH
    git pull origin $BRANCH
    
    echo "✓ Code updated"
ENDSSH

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to pull changes on server${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Changes pulled on server${NC}"
echo ""

# Step 5: Install dependencies
echo -e "${BLUE}[5/7] Installing dependencies on server...${NC}"
ssh $PRODUCTION_SERVER << ENDSSH
    set -e
    cd $PRODUCTION_PATH
    
    echo "Installing root dependencies..."
    npm install --production
    
    if [ -d "client" ]; then
        echo "Installing client dependencies..."
        cd client && npm install --production && cd ..
    fi
    
    if [ -d "server" ]; then
        echo "Installing server dependencies..."
        cd server && npm install --production && cd ..
    fi
    
    echo "✓ Dependencies installed"
ENDSSH

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 6: Build application
echo -e "${BLUE}[6/7] Building application on server...${NC}"
ssh $PRODUCTION_SERVER << ENDSSH
    set -e
    cd $PRODUCTION_PATH
    
    # Build client
    if [ -d "client" ]; then
        echo "Building frontend..."
        cd client && npm run build && cd ..
    fi
    
    # Build server (TypeScript)
    if [ -d "server" ]; then
        echo "Compiling TypeScript..."
        cd server && npx tsc && cd ..
    fi
    
    echo "✓ Build complete"
ENDSSH

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Application built${NC}"
echo ""

# Step 7: Restart services
if [ "$NO_RESTART" = false ]; then
    echo -e "${BLUE}[7/7] Restarting services on server...${NC}"
    ssh $PRODUCTION_SERVER << 'ENDSSH'
        set -e
        cd /root/QA-Portal
        
        # Stop old server process
        echo "Stopping old server process..."
        pkill -f "ts-node src/index.ts" || true
        sleep 2
        
        # Start new server process
        echo "Starting new server process..."
        cd server
        nohup npm exec ts-node src/index.ts > /tmp/qa-server.log 2>&1 &
        SERVER_PID=$!
        echo "Server started with PID: $SERVER_PID"
        
        # Wait a moment and check if it's still running
        sleep 3
        if ps -p $SERVER_PID > /dev/null; then
            echo "✓ Server is running"
        else
            echo "✗ Server failed to start"
            echo "Check logs: tail -f /tmp/qa-server.log"
            exit 1
        fi
        
        # Note: Frontend is served by the build, no restart needed
        echo "✓ Services restarted"
ENDSSH

    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to restart services${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Services restarted${NC}"
else
    echo -e "${YELLOW}[7/7] Skipping service restart${NC}"
fi
echo ""

# Final summary
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "${YELLOW}Branch deployed:${NC} $BRANCH"
echo -e "${YELLOW}Server:${NC} $PRODUCTION_SERVER"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  • Verify the app is working: http://your-server:3000"
echo "  • Check server logs: ssh $PRODUCTION_SERVER 'tail -f /tmp/qa-server.log'"
echo "  • Monitor for errors in the first few minutes"
echo ""
echo -e "${GREEN}🎉 Happy deploying!${NC}"
