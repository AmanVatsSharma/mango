/**
 * @file QUICK_REFERENCE.md
 * @module notifications
 * @description Quick reference for notification system
 * @author BharatERP
 * @created 2025-11-28
 */

# 🔔 Notification System Quick Reference

## For SonuRam ji - Quick Start

### ✅ What Was Fixed
The user dashboard notification bell now works! Users can see notifications created by admins.

### 🧪 Quick Test (30 seconds)

1. **Admin** → Create notification:
   - Go to `/admin-console/notifications`
   - Click "Create Notification"
   - Target: **"ALL"** or **"USERS"**
   - Click Send

2. **User** → View notification:
   - Go to `/dashboard`
   - Look at bell icon (top right)
   - Should see red badge with count
   - Click bell → notification appears!

---

## API Endpoints

### User Notifications
```
GET  /api/notifications?userId={userId}[&includeAdminTargets=true]
PATCH /api/notifications
```
Note: `includeAdminTargets=true` requires an admin role; non-admin requests return 403.

### Admin Notifications  
```
GET  /api/admin/notifications
POST /api/admin/notifications
```

---

## Component Usage

### In User Dashboard
```tsx
import { NotificationBell } from "@/components/notifications/NotificationBell"

<NotificationBell userId={userId} />
```

### In Admin Console
```tsx
import { AdminNotificationBell } from "@/components/admin-console/admin-notification-bell"

<AdminNotificationBell />
```

---

## Notification Targets

| Target | Visible To |
|--------|------------|
| **ALL** | Everyone (users + admins) |
| **USERS** | Regular users only |
| **ADMINS** | Admins only (via admin endpoint or includeAdminTargets) |
| **SPECIFIC** | Specific users (via targetUserIds) |

---

## Priority Levels

| Priority | Badge Color | Use Case |
|----------|-------------|----------|
| **URGENT** | Red | Critical system issues |
| **HIGH** | Orange | Important updates |
| **MEDIUM** | Blue | Regular notifications |
| **LOW** | Gray | FYI messages |

---

## Notification Types

| Type | Icon | Color | Use Case |
|------|------|-------|----------|
| **INFO** | ℹ️ | Blue | General information |
| **SUCCESS** | ✓ | Green | Success messages |
| **WARNING** | ⚠️ | Yellow | Warnings/alerts |
| **ERROR** | ✗ | Red | Error messages |

---

## Console Logs to Check

### Working (User Dashboard)
```
✅ [NOTIFICATION-BELL] Component rendered with userId: abc123
✅ [USE-NOTIFICATIONS] Fetching: /api/notifications?userId=abc123
✅ [USE-NOTIFICATIONS] SWR success: {unreadCount: 2}
✅ [API-NOTIFICATIONS] Fetched 3 notifications (2 unread)
```

### Error (Fix Needed)
```
❌ [USE-NOTIFICATIONS] Invalid userId provided
❌ [API-NOTIFICATIONS] Unauthorized - no session
❌ [API-NOTIFICATIONS] Query userId doesn't match session
```

---

## Files Modified

```
✅ lib/hooks/use-notifications.ts
✅ app/api/notifications/route.ts  
✅ components/notifications/NotificationBell.tsx
✅ components/notifications/NotificationCenter.tsx
```

---

## Database Schema

```prisma
model Notification {
  id            String    @id @default(uuid())
  title         String
  message       String
  type          String    // INFO, WARNING, ERROR, SUCCESS
  priority      String    // LOW, MEDIUM, HIGH, URGENT
  target        String    // ALL, ADMINS, USERS, SPECIFIC
  targetUserIds String[]  // For SPECIFIC target
  readBy        String[]  // UserIds who read it
  expiresAt     DateTime?
  createdBy     String?
  createdAt     DateTime
}
```

---

## Common Commands

### Create Test Notification (SQL)
```sql
INSERT INTO notifications (
  id, title, message, type, priority, target, 
  target_user_ids, read_by, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'Test Notification',
  'Testing user dashboard notifications',
  'INFO',
  'MEDIUM',
  'ALL',
  '{}',
  '{}',
  NOW(),
  NOW()
);
```

### Check Notifications (SQL)
```sql
SELECT id, title, target, created_at, read_by
FROM notifications
ORDER BY created_at DESC
LIMIT 10;
```

### Count Unread (SQL)
```sql
SELECT COUNT(*) as unread_count
FROM notifications
WHERE target IN ('ALL', 'USERS')
  AND NOT ('user-id-here' = ANY(read_by))
  AND (expires_at IS NULL OR expires_at > NOW());
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No badge | Check target (should be ALL/USERS) |
| Badge doesn't update | Wait 30s or click refresh |
| 401 Unauthorized | Login again |
| 403 Forbidden | UserId mismatch - check console |
| Dropdown doesn't open | Check console for errors |

---

## Performance

- **Polling**: Every 30 seconds
- **Cache**: SWR deduplication (5s)
- **Limit**: 50 notifications per request
- **Auto-pause**: When tab is hidden

---

## Security

✅ Session validation required
✅ User can only access own notifications  
✅ Query userId validated against session
✅ Read status tracked per user
✅ No access to other users' data

---

## Next Steps (Future)

- [ ] WebSocket for real-time push (no polling)
- [ ] Email notifications
- [ ] Browser push notifications
- [ ] Notification preferences
- [ ] Rich notifications with actions
- [ ] Analytics dashboard

---

## Support

If issues persist:
1. Check console logs (browser + server)
2. Check Network tab (API responses)
3. Verify database has notifications
4. Review NOTIFICATION_FIX_SUMMARY.md
5. Follow TESTING_GUIDE.md

---

**SonuRam ji**, everything is working now! Create a test notification from admin console and verify it appears in user dashboard. 🙏🎉
