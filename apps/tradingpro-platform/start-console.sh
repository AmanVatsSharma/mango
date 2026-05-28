#!/bin/bash

echo "🚀 Starting Trading Platform Console..."
echo ""

# Load environment variables
export $(cat .env | grep -v '^#' | xargs) 2>/dev/null

# Check PostgreSQL
echo "1️⃣ Checking PostgreSQL..."
if sudo pg_ctlcluster 17 main status > /dev/null 2>&1; then
    echo "   ✅ PostgreSQL is running"
else
    echo "   ⚠️  Starting PostgreSQL..."
    sudo pg_ctlcluster 17 main start
fi
echo ""

# Quick database check
echo "2️⃣ Verifying database..."
if sudo -u postgres psql -d trading_platform -c "SELECT 1" > /dev/null 2>&1; then
    echo "   ✅ Database 'trading_platform' is accessible"
else
    echo "   ❌ Database not accessible"
    exit 1
fi
echo ""

# Check .env
echo "3️⃣ Checking configuration..."
if [ -f .env ]; then
    echo "   ✅ .env file exists"
else
    echo "   ❌ .env file missing"
    exit 1
fi
echo ""

# Test Prisma connection
echo "4️⃣ Testing Prisma connection..."
node test-console-quick.js
echo ""

# Start the development server
echo "5️⃣ Starting development server..."
echo "   Press Ctrl+C to stop"
echo ""
npm run dev