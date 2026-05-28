# 🔔 Notifications System Documentation

## Overview
A comprehensive, modern notification center for users in the trading dashboard. The system provides real-time notifications for all important trading and account events.

## Features

### ✅ Core Features
- **Notification Bell**: Beautiful bell icon in dashboard header with unread count badge
- **Notification Center**: Dropdown panel with modern UI, filters, and real-time updates
- **Real-time Updates**: Auto-refreshes every 30 seconds (pauses when tab is hidden)
- **Mark as Read/Unread**: Individual and bulk actions
- **Filtering**: By type (INFO, SUCCESS, WARNING, ERROR) and read status
- **Beautiful UI**: Modern design with smooth animations and responsive layout

### 📍 Notification Triggers

#### Trading Events
- ✅ **Order Placed**: When user places an order
- ✅ **Order Executed**: When order is successfully executed
- ✅ **Order Cancelled**: When order is cancelled

#### Funds Events
- ✅ **Deposit Request**: When user creates a deposit request
- ✅ **Deposit Approved**: When admin approves deposit
- ✅ **Deposit Rejected**: When admin rejects deposit (with reason)
- ✅ **Withdrawal Request**: When user creates a withdrawal request
- ✅ **Withdrawal Approved**: When admin approves withdrawal
- ✅ **Withdrawal Rejected**: When admin rejects withdrawal (with reason)

#### Account Events
- ✅ **KYC Submitted**: When user submits KYC documents
- ✅ **KYC Approved**: When admin approves KYC
- ✅ **KYC Rejected**: When admin rejects KYC (with reason)

## Architecture

### Components

#### `/components/notifications/NotificationBell.tsx`
- Notification bell icon with badge
- Opens/closes notification center
- Shows unread count

#### `/components/notifications/NotificationCenter.tsx`
- Main notification panel
- Filters and actions
- Beautiful card-based UI
- Real-time updates

### API Endpoints

#### `GET /api/notifications`
- Fetch user notifications
- Query params: `type`, `priority`, `read`, `limit`, `offset`
- Returns: `{ notifications, pagination, unreadCount }`

#### `PATCH /api/notifications`
- Mark notifications as read/unread
- Body: `{ notificationIds: string[], read: boolean }`

### Services

#### `/lib/services/notifications/NotificationService.ts`
Centralized service for creating notifications:
- `createNotification()` - Generic notification creation
- `notifyOrderPlaced()` - Order placement notification
- `notifyOrderExecuted()` - Order execution notification
- `notifyOrderCancelled()` - Order cancellation notification
- `notifyDeposit()` - Deposit notifications (PENDING/APPROVED/REJECTED)
- `notifyWithdrawal()` - Withdrawal notifications (PENDING/APPROVED/REJECTED)
- `notifyKYC()` - KYC notifications (SUBMITTED/APPROVED/REJECTED)
- `notifyPosition()` - Position notifications
- `notifyRiskAlert()` - Risk alert notifications
- `notifyMarginCall()` - Margin call notifications

### Hooks

#### `/lib/hooks/use-notifications.ts`
React hook for managing notifications:
- Fetches notifications with SWR
- Auto-refreshes every 30 seconds
- Provides `markAsRead()` and `markAsUnread()` functions
- Pauses polling when tab is hidden

## Integration Points

### Order Execution Service
- ✅ Notifications on order placement
- ✅ Notifications on order execution
- ✅ Notifications on order cancellation

### Admin Deposit/Withdrawal Routes
- ✅ Notifications on deposit approval/rejection
- ✅ Notifications on withdrawal approval/rejection

### Console Service
- ✅ Notifications on deposit request creation
- ✅ Notifications on withdrawal request creation

### KYC Routes
- ✅ Notifications on KYC submission
- ✅ Notifications on KYC approval/rejection

## Database Schema

Uses existing `Notification` model:
```prisma
model Notification {
  id           String   @id @default(uuid())
  title        String
  message      String
  type         String   @default("INFO") // INFO, WARNING, ERROR, SUCCESS
  priority     String   @default("MEDIUM") // LOW, MEDIUM, HIGH, URGENT
  target       String   @default("ALL") // ALL, ADMINS, USERS, SPECIFIC
  targetUserIds String[] @map("target_user_ids")
  expiresAt    DateTime? @map("expires_at")
  readBy       String[] @default([]) @map("read_by")
  createdBy    String? @map("created_by")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
}
```

## Usage

### Adding Notifications to New Events

```typescript
import { NotificationService } from "@/lib/services/notifications/NotificationService"

// In your service/route handler
try {
  await NotificationService.notifyOrderPlaced(userId, {
    symbol: "RELIANCE",
    quantity: 10,
    orderSide: "BUY",
    orderType: "MARKET"
  })
} catch (error) {
  console.warn("Failed to create notification:", error)
  // Non-blocking - don't fail the main operation
}
```

### Custom Notifications

```typescript
await NotificationService.createNotification({
  title: "Custom Title",
  message: "Custom message",
  type: "INFO", // INFO, WARNING, ERROR, SUCCESS
  priority: "MEDIUM", // LOW, MEDIUM, HIGH, URGENT
  target: "SPECIFIC", // ALL, USERS, ADMINS, SPECIFIC
  targetUserIds: [userId],
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
})
```

## UI Features

### Notification Center
- **Filters**: By type (ALL, INFO, SUCCESS, WARNING, ERROR) and read status
- **Mark All as Read**: Bulk action button
- **Individual Actions**: Mark as read/unread per notification
- **Time Display**: Relative time (e.g., "5m ago", "2h ago")
- **Priority Badges**: Visual indicators for priority levels
- **Type Icons**: Color-coded icons for each notification type

### Notification Bell
- **Badge**: Shows unread count (max 99+)
- **Animation**: Pulse animation for unread notifications
- **Click to Open**: Opens notification center dropdown

## Performance

- **SWR Caching**: Efficient caching and deduplication
- **Optimistic Updates**: Immediate UI updates before server confirmation
- **Background Polling**: Only when tab is visible
- **Non-blocking**: Notification creation never blocks main operations

## Admin Console Integration

### Admin Notification Features
- ✅ **Notification Bell in Header**: Shows unread count for admins
- ✅ **Admin Notification Center**: Full-featured notification management
- ✅ **User Selection**: Select specific users for targeted notifications
- ✅ **Statistics Dashboard**: View notification analytics
- ✅ **Bulk Actions**: Mark multiple notifications as read/delete
- ✅ **Notification Templates**: Pre-built templates for common notifications
- ✅ **Advanced Filters**: Filter by type, priority, read status

### Admin Components
- `/components/admin-console/admin-notification-bell.tsx` - Bell component for admin header
- `/components/admin-console/admin-notification-center-dropdown.tsx` - Dropdown panel
- `/components/admin-console/enhanced-notification-center.tsx` - Full admin notification center

### Admin API Endpoints
- `GET /api/admin/notifications` - Fetch admin notifications
- `POST /api/admin/notifications` - Create notifications
- `GET /api/admin/users/list` - Get user list for targeting

### Admin Notification Templates
1. **Scheduled Maintenance** - For system maintenance announcements
2. **New Feature Available** - For feature announcements
3. **Security Alert** - For security-related notifications
4. **Market Update** - For important market updates

## Future Enhancements

- [ ] Push notifications (browser/mobile)
- [ ] Email notifications
- [ ] SMS notifications
- [ ] Notification preferences/settings
- [ ] Sound alerts
- [ ] Desktop notifications
- [ ] Notification history/archives
- [ ] Scheduled notifications (send at specific time)
- [ ] Notification analytics dashboard
- [ ] Export notifications to CSV/PDF

## Changelog

### 2025-01-27
- ✅ Initial implementation
- ✅ Notification bell and center for users
- ✅ Admin console integration
- ✅ Enhanced admin notification center with templates, user selection, statistics
- ✅ Integration with orders, deposits, withdrawals, KYC
- ✅ Real-time updates
- ✅ Beautiful modern UI
