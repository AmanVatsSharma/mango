/**
 * @file TESTING_GUIDE.md
 * @module notifications
 * @description Step-by-step testing guide for notification system
 * @author BharatERP
 * @created 2025-11-28
 */

# 🧪 Notification System Testing Guide

## Prerequisites

Before testing, ensure:
- ✅ Application is running (`npm run dev`)
- ✅ Database is accessible
- ✅ You have both admin and user accounts

---

## Test Scenario 1: Basic Notification Flow

### Step 1: Create Notification (Admin)

1. **Login as Admin**
   - Navigate to `/admin-console`
   - Use admin credentials

2. **Open Notifications Page**
   - Click on "Notifications" in sidebar
   - Or navigate to `/admin-console/notifications`

3. **Create Test Notification**
   - Click "Create Notification" button
   - Fill in the form:
     ```
     Title: "Welcome Message"
     Message: "Welcome to our trading platform!"
     Type: INFO
     Priority: MEDIUM
     Target: ALL
     ```
   - Click "Send Notification"

4. **Verify Creation**
   - ✅ Success toast appears
   - ✅ Notification appears in the list
   - ✅ "New" badge visible (if admin hasn't read it yet)

### Step 2: View Notification (User)

1. **Login as Regular User**
   - Navigate to `/dashboard`
   - Use non-admin user credentials

2. **Check Notification Bell**
   - Look at top-right header
   - ✅ Bell icon should have red badge with "1"
   - ✅ Badge should have pulsing animation

3. **Open Notification Panel**
   - Click on the bell icon
   - ✅ Dropdown panel opens
   - ✅ "Welcome Message" notification appears
   - ✅ Blue dot visible (indicating unread)
   - ✅ Content matches what admin created

4. **Mark as Read**
   - Click checkmark icon on notification
   - ✅ Blue dot disappears
   - ✅ Badge count decreases to 0
   - ✅ Badge disappears from bell icon

5. **Mark as Unread**
   - Click bell icon on notification
   - ✅ Blue dot reappears
   - ✅ Badge count increases to 1
   - ✅ Badge reappears on bell icon

---

## Test Scenario 2: Notification Targeting

### Test 2A: Target "USERS" Only

1. **Create Notification (Admin)**
   ```
   Title: "Users Only Notification"
   Message: "This is only for regular users"
   Type: INFO
   Priority: MEDIUM
   Target: USERS
   ```

2. **Verify as User**
   - ✅ Notification appears in user dashboard bell
   - ✅ Badge count includes this notification

3. **Verify as Admin**
   - ❌ Notification does NOT appear in admin console bell
   - ✅ Still visible in notifications management page

### Test 2B: Target "ADMINS" Only

1. **Create Notification (Admin)**
   ```
   Title: "Admins Only Notification"
   Message: "System maintenance scheduled"
   Type: WARNING
   Priority: HIGH
   Target: ADMINS
   ```

2. **Verify as Admin**
   - ✅ Notification appears in admin console bell
   - ✅ Badge count includes this notification

3. **Verify as User**
   - ❌ Notification does NOT appear in user dashboard bell

### Test 2C: Target "ALL"

1. **Create Notification (Admin)**
   ```
   Title: "All Users Notification"
   Message: "New features released!"
   Type: SUCCESS
   Priority: MEDIUM
   Target: ALL
   ```

2. **Verify as User**
   - ✅ Notification appears in user dashboard bell

3. **Verify as Admin**
   - ✅ Notification appears in admin console bell

---

## Test Scenario 3: Real-Time Updates

### Test 3A: Polling (Auto-refresh)

1. **Keep User Dashboard Open**
   - Login as user
   - Keep dashboard tab active
   - Note current notification count

2. **Create Notification (Admin)**
   - In different browser/tab, login as admin
   - Create new notification targeting USERS or ALL

3. **Wait and Observe**
   - Wait up to 30 seconds (polling interval)
   - ✅ Badge count should increase automatically
   - ✅ No page refresh needed
   - ✅ New notification appears when bell clicked

### Test 3B: Manual Refresh

1. **Open Notification Panel (User)**
   - Click bell icon to open dropdown

2. **Create Notification (Admin)**
   - In different browser/tab, create notification

3. **Manual Refresh**
   - Click refresh icon in notification panel header
   - ✅ New notification appears immediately
   - ✅ Badge count updates

---

## Test Scenario 4: Multiple Notifications

### Setup

1. **Create Multiple Notifications (Admin)**
   - Create 5 different notifications:
     ```
     1. Type: INFO, Priority: LOW
     2. Type: SUCCESS, Priority: MEDIUM
     3. Type: WARNING, Priority: HIGH
     4. Type: ERROR, Priority: URGENT
     5. Type: INFO, Priority: MEDIUM
     ```

2. **Target All to USERS**

### Verify Display (User)

1. **Check Badge**
   - ✅ Badge shows "5"
   - ✅ If count > 99, shows "99+"

2. **Open Notification Panel**
   - ✅ All 5 notifications listed
   - ✅ Sorted by newest first
   - ✅ Each has appropriate icon based on type:
     - INFO: Blue info icon
     - SUCCESS: Green checkmark
     - WARNING: Yellow warning triangle
     - ERROR: Red X circle
   - ✅ Priority badges visible (except MEDIUM)

3. **Mark All as Read**
   - Click "Mark all as read" button
   - ✅ All blue dots disappear
   - ✅ Badge count goes to 0
   - ✅ All notifications remain in list

---

## Test Scenario 5: Error Handling

### Test 5A: Network Error

1. **Simulate Network Failure**
   - Open DevTools → Network tab
   - Set throttling to "Offline"

2. **Try to Refresh Notifications**
   - Click refresh icon in panel
   - ✅ Error indicator appears (yellow dot on bell)
   - ✅ Error message in panel
   - ✅ Retry button available

3. **Restore Network**
   - Set throttling back to "Online"
   - Click retry button
   - ✅ Notifications load successfully

### Test 5B: Session Expired

1. **Expire Session**
   - Clear cookies in DevTools
   - Or wait for session timeout

2. **Try to Load Notifications**
   - Refresh page
   - ✅ Redirected to login page
   - ✅ After login, notifications load correctly

---

## Test Scenario 6: Performance Testing

### Test 6A: Large Number of Notifications

1. **Create 50+ Notifications (Admin)**
   - Use admin console to create many notifications

2. **Load User Dashboard**
   - Login as user
   - ✅ Dashboard loads without lag
   - ✅ Bell icon appears quickly

3. **Open Notification Panel**
   - Click bell icon
   - ✅ Panel opens smoothly
   - ✅ Scrolling is smooth
   - ✅ Only first 50 loaded (pagination)

### Test 6B: Multiple Tabs

1. **Open Dashboard in 3 Tabs**
   - Login as same user in 3 different tabs
   - ✅ Each tab shows same unread count

2. **Mark as Read in Tab 1**
   - Click checkmark on notification
   - ✅ Badge updates in Tab 1
   - Wait 30 seconds
   - ✅ Badge updates in Tab 2 and Tab 3 (polling)

---

## Test Scenario 7: Browser Compatibility

Test in multiple browsers:

### Chrome/Edge
- ✅ Notification bell renders correctly
- ✅ Badge animations smooth
- ✅ Dropdown positioning correct
- ✅ Click events work

### Firefox
- ✅ Same as Chrome

### Safari
- ✅ Same as Chrome
- ⚠️ Check backdrop blur support

### Mobile Chrome/Safari
- ✅ Bell icon visible and clickable
- ✅ Dropdown full width on mobile
- ✅ Touch events work
- ✅ Scrolling smooth

---

## Test Scenario 8: Console Logging Verification

### Expected Console Logs (User Dashboard)

```javascript
// On dashboard load
🔔 [NOTIFICATION-BELL] Component rendered with userId: abc123
🔔 [USE-NOTIFICATIONS] Hook called with userId: abc123

// On API request
🔔 [USE-NOTIFICATIONS] Fetching notifications from: /api/notifications?userId=abc123

// On success
🔔 [USE-NOTIFICATIONS] SWR success: {
  notificationsCount: 3,
  unreadCount: 2,
  userId: "abc123",
  hasNotifications: true
}

// On state update
🔔 [NOTIFICATION-BELL] State updated: {
  userId: "abc123",
  unreadCount: 2,
  isLoading: false,
  hasError: false
}

// On mark as read
🔔 [USE-NOTIFICATIONS] Marking notifications as read: ["notif-id-1"]
```

### Expected Server Logs

```javascript
// On API request
🔔 [API-NOTIFICATIONS] GET request received
🔔 [API-NOTIFICATIONS] Session details: {
  sessionUserId: "abc123",
  queryUserId: "abc123",
  userEmail: "user@example.com"
}
📋 [API-NOTIFICATIONS] Query params: {
  type: null,
  priority: null,
  read: null,
  userId: "abc123"
}
✅ [API-NOTIFICATIONS] Fetched 3 notifications (2 unread) for user abc123
```

---

## Test Checklist

### Functionality Tests
- [ ] Notification bell renders in user dashboard
- [ ] Badge shows correct unread count
- [ ] Badge animates (pulse effect)
- [ ] Click bell opens dropdown
- [ ] Notifications displayed in dropdown
- [ ] Icons match notification types
- [ ] Priority badges visible
- [ ] Timestamps show relative time
- [ ] Mark as read works
- [ ] Mark as unread works
- [ ] Mark all as read works
- [ ] Refresh button works
- [ ] Close button works
- [ ] Backdrop closes dropdown
- [ ] Polling updates automatically (30s)
- [ ] Manual refresh updates immediately

### Targeting Tests
- [ ] "ALL" target visible to everyone
- [ ] "USERS" target visible to users only
- [ ] "ADMINS" target visible to admins only
- [ ] "SPECIFIC" target works with targetUserIds

### Security Tests
- [ ] Cannot access without login (401)
- [ ] Cannot access other user's notifications (403)
- [ ] Query userId validated against session
- [ ] Session expiry handled gracefully

### Performance Tests
- [ ] Dashboard loads quickly with many notifications
- [ ] Dropdown opens smoothly
- [ ] Scrolling is smooth with 50+ notifications
- [ ] No memory leaks on polling
- [ ] Multiple tabs sync correctly

### Error Handling Tests
- [ ] Network error shows error indicator
- [ ] Retry button appears on error
- [ ] Error messages are clear
- [ ] Graceful degradation on API failure

### Browser Compatibility Tests
- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Works on mobile Chrome
- [ ] Works on mobile Safari
- [ ] Responsive on all screen sizes

---

## Common Issues & Solutions

### Issue: Badge doesn't update after creating notification

**Check:**
1. Target is set correctly (ALL or USERS for regular users)
2. Notification hasn't expired
3. Wait 30 seconds for polling to update
4. Or manually click refresh button

### Issue: Dropdown doesn't open

**Check:**
1. Click is registering (check console logs)
2. Z-index conflicts with other elements
3. JavaScript errors in console
4. userId is valid

### Issue: "Unauthorized" error

**Check:**
1. User is logged in
2. Session is valid (not expired)
3. Session contains userId
4. Auth configuration is correct

### Issue: Notifications don't appear

**Check:**
1. Notifications exist in database
2. Target matches user type (USER/ADMIN)
3. Notification hasn't expired
4. API returns notifications (check Network tab)
5. userId matches session userId

---

## Automated Testing Script

```javascript
// test-notifications.js
// Run with: node test-notifications.js

const scenarios = [
  {
    name: "Create and View Notification",
    steps: [
      "Create notification as admin targeting USERS",
      "Login as user",
      "Verify badge count is 1",
      "Open notification panel",
      "Verify notification appears"
    ]
  },
  {
    name: "Mark as Read",
    steps: [
      "Open notification panel",
      "Click mark as read",
      "Verify badge count decreases",
      "Verify blue dot disappears"
    ]
  },
  // Add more scenarios...
]

// Run tests
scenarios.forEach(scenario => {
  console.log(`Running: ${scenario.name}`)
  // Execute steps...
})
```

---

## Performance Benchmarks

### Expected Performance
- Initial load: < 500ms
- API response: < 200ms
- Dropdown open: < 100ms
- Mark as read: < 300ms
- Polling interval: 30s (configurable)

### Memory Usage
- Base: ~2MB
- With 50 notifications: ~3MB
- With polling active: ~2.5MB

---

## Conclusion

This testing guide covers all major scenarios for the notification system. Follow these tests to ensure the system is working correctly after deployment or updates.

**Test Status Legend:**
- ✅ = Test passed
- ❌ = Test failed
- ⚠️ = Test passed with warnings
- 🔄 = Test in progress

**SonuRam ji**, please use this guide to thoroughly test the notification system! 🙏
