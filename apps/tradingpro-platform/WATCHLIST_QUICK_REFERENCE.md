# Watchlist Quick Reference Card

## 🚀 Quick Setup
```bash
npx prisma generate
npm run dev
```

## 🎯 Left Swipe Delete - How It Works

### User Action
```
Swipe Left → Red Button → Click → Item Deleted ✅
```

### Code Flow
```typescript
// 1. Component triggers
WatchlistItemCard.handleQuickAction('remove')

// 2. Calls parent handler
onRemove(item.watchlistItemId)

// 3. Manager handles it
const handleRemoveItem = async (itemId: string) => {
  await removeItem(itemId)
  await refetchWatchlists()
}

// 4. Hook makes API call
await fetch(`/api/watchlists/items/${itemId}`, {
  method: 'DELETE'
})

// 5. API uses transaction
await withRemoveWatchlistItemTransaction(itemId, userId)

// 6. Transaction executes
prisma.$transaction(async (tx) => {
  await tx.watchlistItem.delete({ where: { id: itemId } })
})
```

## 📁 Key Files

| File | Purpose |
|------|---------|
| `lib/watchlist-transactions.ts` | Transaction utilities |
| `lib/hooks/use-prisma-watchlist.ts` | React hooks |
| `app/api/watchlists/items/[itemId]/route.ts` | Delete API |
| `components/watchlist/WatchlistManager.tsx` | Main component |
| `components/watchlist/WatchlistItemCard.tsx` | Swipe component |

## 🔧 Common Operations

### Get All Watchlists
```typescript
const { watchlists, isLoading, refetch } = useEnhancedWatchlists(userId)
```

### Add Item
```typescript
const { addItem } = useWatchlistItems(watchlistId)
await addItem({ stockId: 'xxx' })
```

### Remove Item (Left Swipe)
```typescript
const { removeItem } = useWatchlistItems(watchlistId)
await removeItem(itemId)
```

### Update Item
```typescript
const { updateItem } = useWatchlistItems(watchlistId)
await updateItem(itemId, { alertPrice: 100 })
```

## 🎨 API Endpoints

```bash
# Watchlists
GET    /api/watchlists              # Get all
POST   /api/watchlists              # Create
GET    /api/watchlists/[id]         # Get one
PUT    /api/watchlists/[id]         # Update
DELETE /api/watchlists/[id]         # Delete

# Items
POST   /api/watchlists/[id]/items   # Add item
GET    /api/watchlists/items/[id]   # Get item
PUT    /api/watchlists/items/[id]   # Update item
DELETE /api/watchlists/items/[id]   # Remove item ⭐
```

## 🔒 Transaction Features

✅ **Atomic** - All or nothing
✅ **Consistent** - Data stays valid
✅ **Isolated** - No interference
✅ **Durable** - Changes persist

## 🧪 Testing

```bash
# Run test script
node scripts/test-watchlist.js

# Expected output:
# ✅ Database connected
# ✅ Watchlist created
# ✅ Item added
# ✅ Item deleted (LEFT SWIPE)
# ✅ Watchlist deleted
# 🎉 All tests passed
```

## 🐛 Debugging

### Check Transaction Logs
```typescript
// Look for these in console:
🔄 Starting database transaction
📋 Creating watchlist for user: [userId]
✅ Transaction completed in XXms
```

### Check API Response
```bash
curl -X DELETE http://localhost:3000/api/watchlists/items/[itemId] \
  -H "Cookie: [session]"

# Expected: {"success": true}
```

### Check Hook Behavior
```typescript
// Add console.logs in hook
const removeItem = useCallback(async (itemId: string) => {
  console.log('🗑️ Removing item:', itemId)
  const response = await fetch(...)
  console.log('✅ Response:', response.status)
}, [])
```

## ⚡ Performance Tips

1. **Use Transaction Timeout**
   ```typescript
   withTransaction(async (tx) => {
     // Your code
   }, { timeout: 10000 })
   ```

2. **Batch Operations**
   ```typescript
   await prisma.$transaction([
     prisma.watchlistItem.deleteMany({ where: { watchlistId } }),
     prisma.watchlist.delete({ where: { id: watchlistId } })
   ])
   ```

3. **Optimize Queries**
   ```typescript
   include: {
     items: {
       take: 50, // Limit items
       orderBy: { sortOrder: 'asc' }
     }
   }
   ```

## 🎯 Best Practices

✅ Always use transactions for multi-step operations
✅ Verify ownership before any mutation
✅ Handle errors at all levels
✅ Show loading states to users
✅ Refetch data after mutations
✅ Use optimistic updates for better UX
✅ Log transactions for debugging

## 🚨 Error Handling

```typescript
try {
  await removeItem(itemId)
  // Success toast
  toast({ title: "Stock Removed" })
} catch (error) {
  // Error toast
  toast({
    title: "Failed to Remove Stock",
    description: error.message,
    variant: "destructive"
  })
}
```

## 📊 Transaction Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 401 | Unauthorized |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 500 | Server Error |

## 🎨 UI States

```typescript
// Loading
isRemoving={removingItems.has(item.id)}

// Success
await removeItem(itemId)
await refetchWatchlists()

// Error
catch (error) {
  // Show error toast
}
```

## 📝 Type Definitions

```typescript
interface WatchlistItemData {
  id: string
  watchlistItemId: string  // ⭐ Use this for delete
  instrumentId: string
  symbol: string
  name: string
  ltp: number
  close: number
  // ... more fields
}
```

## 🔗 Dependencies

```json
{
  "@prisma/client": "^5.x.x",
  "prisma": "^5.x.x",
  "next": "^14.x.x",
  "react": "^18.x.x"
}
```

## 📞 Quick Help

**Problem**: Left swipe delete not working
**Check**:
1. Is Prisma client generated? `npx prisma generate`
2. Is session valid? Check auth
3. Is item ID correct? Check `watchlistItemId`
4. Any console errors? Check browser/server logs

**Problem**: Transaction timeout
**Solution**: Increase timeout in transaction options

**Problem**: Database connection error
**Solution**: Check `.env` file for `DATABASE_URL`

---

## ✨ Remember

**The left swipe delete uses `item.watchlistItemId` not `item.id`!**

```typescript
// ✅ Correct
onRemove(item.watchlistItemId)

// ❌ Wrong
onRemove(item.id)
```

---

**Last Updated**: October 8, 2025
**Version**: 1.0.0
**Status**: Production Ready ✅