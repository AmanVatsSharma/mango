#!/bin/bash
echo "🔍 Verifying Console Setup..."
echo ""

ERRORS=0

# Check node_modules
if [ -d "node_modules" ]; then
    echo "✅ node_modules installed"
else
    echo "❌ node_modules missing - run: pnpm install"
    ERRORS=$((ERRORS + 1))
fi

# Check .env
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    if grep -q "DATABASE_URL" .env; then
        echo "✅ DATABASE_URL configured"
    else
        echo "❌ DATABASE_URL missing from .env"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "❌ .env file missing"
    ERRORS=$((ERRORS + 1))
fi

# Check Prisma client
if [ -d "node_modules/.prisma" ] || [ -d "node_modules/@prisma/client" ]; then
    echo "✅ Prisma client generated"
else
    echo "❌ Prisma client not generated - run: pnpm prisma generate"
    ERRORS=$((ERRORS + 1))
fi

# Check PostgreSQL
if command -v pg_isready &> /dev/null; then
    if pg_isready -q 2>/dev/null; then
        echo "✅ PostgreSQL is running"
    else
        echo "⚠️  PostgreSQL not responding - run: sudo pg_ctlcluster 17 main start"
    fi
else
    echo "⚠️  PostgreSQL might not be installed"
fi

# Check key API file
if [ -f "app/api/console/route.ts" ]; then
    echo "✅ Console API route exists"
else
    echo "❌ Console API route missing"
    ERRORS=$((ERRORS + 1))
fi

# Check service files
if [ -f "lib/services/console/ConsoleService.ts" ]; then
    echo "✅ Console service exists"
else
    echo "❌ Console service missing"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $ERRORS -eq 0 ]; then
    echo "✅ All checks passed!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🚀 Ready to start! Run:"
    echo "   npm run dev"
    echo ""
    echo "📱 Then visit:"
    echo "   http://localhost:3000/console"
    echo ""
    echo "🔑 Login with:"
    echo "   Email: test@example.com"
    echo "   Password: password123"
else
    echo "⚠️  $ERRORS issue(s) found"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📖 See CONSOLE_API_FIXED.md for help"
fi

echo ""