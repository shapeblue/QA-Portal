#!/bin/bash

# QA Portal - First Time Setup Script
# Run this on your local machine after cloning the repository

set -e

echo "=========================================="
echo "QA Portal - Local Setup"
echo "=========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version is too old. You have v$(node -v), but need v16+"
    exit 1
fi
echo "✅ Node.js $(node -v) found"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi
echo "✅ npm $(npm -v) found"

# Check Git
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed"
    exit 1
fi
echo "✅ Git found"

echo ""
echo "Installing dependencies..."
echo ""

# Install root dependencies
echo "[1/3] Installing root dependencies..."
npm install

# Install client dependencies
echo "[2/3] Installing client dependencies..."
cd client
npm install
cd ..

# Install server dependencies
echo "[3/3] Installing server dependencies..."
cd server
npm install
cd ..

echo ""
echo "✅ Dependencies installed successfully!"
echo ""

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env file"
        echo ""
        echo "⚠️  IMPORTANT: Edit .env and add your database credentials!"
        echo "   You need:"
        echo "   - DB_HOST, DB_PORT, DB_NAME"
        echo "   - DB_USER, DB_PASSWORD"
        echo "   - GITHUB_TOKEN (optional but recommended)"
    else
        echo "❌ .env.example not found. Please create .env manually."
    fi
else
    echo "✅ .env file exists"
fi

echo ""
echo "=========================================="
echo "Setup Complete! 🎉"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Edit .env with your database credentials"
echo "  2. Start development: npm run dev"
echo "  3. Open http://localhost:3000 in your browser"
echo ""
echo "Need help? Check docs/LOCAL_SETUP.md"
