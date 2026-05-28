#!/bin/bash
echo "🧪 Starting Console Tests..."

# 1. Check PostgreSQL
echo "1️⃣ Checking PostgreSQL..."
sudo service postgresql status > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ PostgreSQL is running"
else
    echo "❌ PostgreSQL is not running. Starting..."
    sudo service postgresql start
fi

# 2. Check database
echo "2️⃣ Checking database..."
sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw trading_platform
if [ $? -eq 0 ]; then
    echo "✅ Database exists"
else
    echo "❌ Database does not exist"
fi

# 3. Check .env file
echo "3️⃣ Checking .env file..."
if [ -f .env ]; then
    echo "✅ .env file exists"
    if grep -q "DATABASE_URL" .env; then
        echo "✅ DATABASE_URL is configured"
    else
        echo "❌ DATABASE_URL is missing"
    fi
else
    echo "❌ .env file does not exist"
fi

# 4. Check server
echo "4️⃣ Checking server..."
curl -s http://localhost:3000/api/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Server is responding"
    HEALTH=$(curl -s http://localhost:3000/api/health)
    echo "   Health check: $HEALTH"
else
    echo "❌ Server is not responding (make sure to run 'npm run dev')"
fi

# 5. Test console API
echo "5️⃣ Testing console API..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/console)
if [ "$RESPONSE" = "307" ] || [ "$RESPONSE" = "401" ]; then
    echo "✅ Console API is working (redirecting to auth as expected)"
else
    echo "⚠️  Unexpected response code: $RESPONSE"
fi

# 6. Check test user
echo "6️⃣ Checking test user..."
USER_EXISTS=$(sudo -u postgres psql -d trading_platform -tAc "SELECT COUNT(*) FROM users WHERE email='test@example.com'")
if [ "$USER_EXISTS" = "1" ]; then
    echo "✅ Test user exists (test@example.com)"
else
    echo "⚠️  Test user does not exist. Run: npx tsx scripts/create-test-user.ts"
fi

echo ""
echo "================================"
echo "✅ Tests complete!"
echo "================================"
echo ""
echo "To access the console:"
echo "1. Make sure server is running: npm run dev"
echo "2. Open browser: http://localhost:3000/auth/login"
echo "3. Login with: test@example.com / password123"
echo "4. Navigate to: http://localhost:3000/console"
