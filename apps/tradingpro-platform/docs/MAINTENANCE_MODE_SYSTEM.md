# 🔧 Maintenance Mode System

## Overview

A comprehensive, enterprise-level maintenance mode system for MarketPulse360 that provides seamless maintenance management with admin bypass capabilities, real-time status updates, and professional user experience.

## Features

### ✅ Core Features
- **Environment Variable Control** - Easy toggle via `MAINTENANCE_MODE=true`
- **Admin Bypass** - Admins can access system during maintenance
- **Real-time Countdown** - Shows estimated completion time
- **Status Updates** - Progress indicators and status messages
- **Responsive Design** - Works on all devices (mobile-first)
- **API Endpoints** - Programmatic control and status checking
- **Console Logging** - Comprehensive debugging and monitoring
- **TypeScript Support** - Full type safety and IntelliSense

### 🎨 Design Features
- **Enterprise UI** - Professional maintenance page design
- **Animated Background** - Subtle animations for visual appeal
- **Progress Indicators** - Visual feedback on maintenance progress
- **Accessibility** - WCAG AA compliant with screen reader support
- **Dark Theme** - Consistent with application theme

## Architecture

### File Structure
```
/components/maintenance/
├── MaintenanceMode.tsx          # Main maintenance component
└── index.ts                     # Barrel exports

/app/maintenance/
└── page.tsx                     # Maintenance page route

/app/api/maintenance/
├── status/route.ts              # Status API endpoint
└── toggle/route.ts              # Toggle API endpoint

/lib/
└── maintenance.ts               # Utility functions

/docs/
└── MAINTENANCE_MODE_SYSTEM.md   # This documentation
```

### Component Hierarchy
```
MaintenancePage (app/maintenance/page.tsx)
└── MaintenanceMode (components/maintenance/MaintenanceMode.tsx)
    ├── Status Badge
    ├── Countdown Timer
    ├── Progress Indicators
    ├── Action Buttons
    └── Contact Information
```

## Configuration

### Environment Variables

Add these to your `.env.local` file:

```bash
# ===========================================
# MAINTENANCE MODE
# ===========================================
# Set to true to enable maintenance mode
MAINTENANCE_MODE=true

# Optional: Custom maintenance message
MAINTENANCE_MESSAGE="We're performing scheduled maintenance to improve your experience. We'll be back shortly!"

# Optional: Estimated maintenance end time (ISO format)
MAINTENANCE_END_TIME="2024-01-15T18:00:00Z"

# Optional: Allow admin bypass (default: true)
MAINTENANCE_ALLOW_ADMIN_BYPASS=true
```

### MAINTENANCE_MODE vs database (precedence)

Effective maintenance on/off is computed in [`lib/maintenance.ts`](../lib/maintenance.ts): `applyMaintenanceModeEnvOverride()` runs after loading **global** DB settings ([`lib/server/maintenance.ts`](../lib/server/maintenance.ts) uses `category: MAINTENANCE`, `ownerId: null`, newest-first).

- **`MAINTENANCE_MODE` unset** (or any value other than the literal strings `true` / `false`): **`isEnabled` follows the database** (when the status API reads the DB; if that fails, env-only fallback behavior is unchanged).
- **`MAINTENANCE_MODE=true` or `MAINTENANCE_MODE=false`**: **`isEnabled` is forced** on or off application-wide and **overrides** the database—use as an emergency kill switch (e.g. force off: `MAINTENANCE_MODE=false` after deploy/restart).

If production always sets `MAINTENANCE_MODE=false`, turning maintenance **on** from admin settings will not apply until that variable is removed or set to `true`.

### Next.js Configuration

The system automatically exposes environment variables to the client through `next.config.mjs`:

```javascript
env: {
  MAINTENANCE_MODE: process.env.MAINTENANCE_MODE || 'false',
  MAINTENANCE_MESSAGE: process.env.MAINTENANCE_MESSAGE,
  MAINTENANCE_END_TIME: process.env.MAINTENANCE_END_TIME,
  MAINTENANCE_ALLOW_ADMIN_BYPASS: process.env.MAINTENANCE_ALLOW_ADMIN_BYPASS || 'true',
}
```

## Usage

### Enabling Maintenance Mode

1. **Set Environment Variable**:
   ```bash
   MAINTENANCE_MODE=true
   ```

2. **Restart Application**:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

3. **Verify**: Visit any route - you should be redirected to `/maintenance`

### Disabling Maintenance Mode

1. **Set Environment Variable**:
   ```bash
   MAINTENANCE_MODE=false
   ```

2. **Restart Application**:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

### Admin Bypass

Admins with roles `ADMIN` or `SUPER_ADMIN` can bypass maintenance mode:

1. **Login as Admin** - Navigate to `/auth/login`
2. **Access System** - You'll be able to use the application normally
3. **Console Logs** - Check console for bypass confirmation

## API Endpoints

### GET /api/maintenance/status

Get current maintenance status:

```bash
curl http://localhost:3000/api/maintenance/status
```

**Response**:
```json
{
  "success": true,
  "data": {
    "isMaintenanceMode": true,
    "message": "We're performing scheduled maintenance...",
    "endTime": "2024-01-15T18:00:00Z",
    "lastChecked": "2024-01-15T10:30:00.000Z"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### POST /api/maintenance/toggle

Toggle maintenance mode (requires admin privileges):

```bash
curl -X POST http://localhost:3000/api/maintenance/toggle \
  -H "x-user-role: ADMIN"
```

**Response**:
```json
{
  "success": true,
  "message": "Maintenance mode toggle would be implemented here",
  "currentStatus": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Middleware Integration

The maintenance mode check is integrated into the main middleware (`middleware.ts`) with highest priority:

```typescript
// 0. MAINTENANCE MODE CHECK - Highest priority
if (isMaintenanceModeActive()) {
  // Allow maintenance page and API endpoints
  if (nextUrl.pathname === '/maintenance' || nextUrl.pathname.startsWith('/api/maintenance/')) {
    return NextResponse.next();
  }
  
  // Check admin bypass
  if (canBypassMaintenance(userRole)) {
    // Continue with normal flow
  } else {
    return NextResponse.redirect(new URL('/maintenance', nextUrl));
  }
}
```

## Customization

### Custom Maintenance Message

Update the `MAINTENANCE_MESSAGE` environment variable:

```bash
MAINTENANCE_MESSAGE="Custom maintenance message here"
```

### Custom End Time

Set the `MAINTENANCE_END_TIME` environment variable:

```bash
MAINTENANCE_END_TIME="2024-01-15T18:00:00Z"
```

### Disable Admin Bypass

Set `MAINTENANCE_ALLOW_ADMIN_BYPASS` to `false`:

```bash
MAINTENANCE_ALLOW_ADMIN_BYPASS=false
```

### Custom Styling

Modify the `MaintenanceMode.tsx` component:

```tsx
// Change colors
<div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">

// Change icons
<Wrench className="w-8 h-8 text-orange-400" />

// Change progress indicators
<div className="flex items-center gap-3 text-sm">
  <CheckCircle className="w-4 h-4 text-green-400" />
  <span className="text-slate-300">Your custom status</span>
</div>
```

## Console Logging

The system provides comprehensive console logging for debugging:

```bash
[MaintenanceMode] Component mounted { isMaintenanceMode: true, ... }
[MaintenanceConfig] Reading maintenance configuration from environment variables
[MaintenanceConfig] Configuration loaded from environment: { isEnabled: true, ... }
[MaintenanceMode] Checking if maintenance mode is active: true
[MIDDLEWARE] 🔧 Maintenance mode is active (from environment configuration)
[MIDDLEWARE] ✅ Admin bypass granted for role: ADMIN
[MaintenanceAPI] Status check requested
```

## Testing

### Manual Testing

1. **Enable Maintenance Mode**:
   ```bash
   MAINTENANCE_MODE=true npm run dev
   ```

2. **Test Routes**:
   - Visit `/` → Should redirect to `/maintenance`
   - Visit `/dashboard` → Should redirect to `/maintenance`
   - Visit `/maintenance` → Should show maintenance page

3. **Test Admin Bypass**:
   - Login as admin
   - Visit any route → Should work normally

4. **Test API**:
   ```bash
   curl http://localhost:3000/api/maintenance/status
   ```

### Automated Testing

```bash
# Test maintenance mode detection
npm test -- --testNamePattern="maintenance"

# Test API endpoints
npm test -- --testNamePattern="maintenance.*api"
```

## Troubleshooting

### Issue: Maintenance mode not working

**Solution**: Check environment variables are properly set and restart the application.

### Issue: Admin bypass not working

**Solution**: Verify user role is `ADMIN`, `MODERATOR`, or `SUPER_ADMIN`.

### Issue: Countdown timer not showing

**Solution**: Ensure `MAINTENANCE_END_TIME` is set in correct ISO format.

### Issue: Styling issues

**Solution**: Check Tailwind CSS classes are properly configured.

## Security Considerations

1. **Environment Variables**: Keep maintenance settings secure
2. **Admin Bypass**: Only trusted admins should have bypass access
3. **API Endpoints**: Toggle endpoint requires proper authentication
4. **Logging**: Sensitive information is not logged

## Performance

- **Static Generation**: Maintenance page is statically generated
- **Minimal Bundle**: Only loads necessary components
- **Efficient Rendering**: Uses React hooks for optimal performance
- **Caching**: API responses are cached appropriately

## Browser Support

✅ Chrome/Edge (Full support)  
✅ Firefox (Full support)  
✅ Safari (Full support)  
✅ Mobile browsers (iOS & Android)

## Future Enhancements

1. **Database Integration**: Store maintenance settings in database
2. **Scheduled Maintenance**: Automatic maintenance scheduling
3. **User Notifications**: Email/SMS notifications before maintenance
4. **Maintenance History**: Track maintenance events
5. **Custom Themes**: Multiple maintenance page themes
6. **Multi-language**: Internationalization support

## Support

For issues or questions:

1. **Check Console Logs**: Look for error messages
2. **Verify Configuration**: Ensure environment variables are correct
3. **Test API Endpoints**: Use provided API endpoints for debugging
4. **Contact Support**: Reach out to the development team

## Changelog (2026-04-03)

- **Toggle API (tradingpro-platform):** Fixed missing `canManageMaintenanceSettings` (now in `lib/maintenance-rbac.ts`, shared pattern with TradeBazaar).
- **Public page:** `/maintenance` loads message and end time from **GET `/api/maintenance/status`** (same DB source as middleware), with env fallback if the request fails.
- **API clients during maintenance:** Non-bypass requests to `/api/*` receive **503** JSON `{ success: false, code: "MAINTENANCE", ... }` instead of an HTML redirect (better for `fetch` and SSE clients).
- **Logging:** Maintenance status/config/toggle routes log via **`lib/observability/logger`** (pino), not raw `console.log`.

## Env vs database precedence (middleware)

1. **Normal:** Edge middleware calls **GET `/api/maintenance/status`** (reads `system_settings` category `MAINTENANCE`). Short in-memory caches (~5s) apply in middleware and Node layers.
2. **If that internal fetch fails:** Gate falls back to **`MAINTENANCE_MODE`** and **`MAINTENANCE_ALLOW_ADMIN_BYPASS`** env vars only (`getMaintenanceEnvFallbackGate()`). Operators should treat env as break-glass override when the app cannot reach its own status endpoint.

---

**Status**: ✅ Complete and Production Ready  
**Last Updated**: 2026  
**Version**: 1.1.0