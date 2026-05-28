# Password Reset Flow

> **Last Updated:** 2025-10-07  
> **Status:** ✅ Fully Implemented - Routes accessible to ALL users (logged in or not)

This document describes the secure email-based password reset that accepts a unified identifier (email, mobile number, or Client ID).

## ✅ Critical Fix Applied (2025-10-07)

**Issue:** Password reset pages were inaccessible to logged-in users due to middleware redirects.

**Solution:** Added special exception in middleware to allow password reset routes for EVERYONE:
```typescript
// middleware.ts - Section 2.25
const passwordResetRoutes = [
  "/auth/forgot-password",
  "/auth/password-reset"
];

if (isPasswordResetRoute) {
  console.log(`[MIDDLEWARE] 🔓 Password reset route - allowing access for all users`);
  return NextResponse.next(); // Allow for ALL users, regardless of login state
}
```

## 🎯 UI Pages

### 1. Forgot Password Page
- **Path:** `app/(main)/auth/forgot-password/page.tsx`
- **Purpose:** User enters identifier to request password reset
- **Access:** ✅ Everyone (logged in or not)
- **Component:** `ForgotPasswordPage`

### 2. Password Reset Page
- **Path:** `app/(main)/auth/password-reset/page.tsx`
- **Purpose:** User enters new password with token
- **Access:** ✅ Everyone (logged in or not)
- **Component:** `PasswordResetPage`

## 🔧 Server Actions

### resetPassword({ identifier })
- **Location:** `actions/auth.actions.ts` (lines 312-438)
- **Input:** `{ identifier: string }` (email, phone, or clientId)
- **Process:**
  1. Validates identifier
  2. Finds user by email/phone/clientId
  3. Generates password reset token (1 hour expiry)
  4. Sends reset link via email
  5. Generates OTP (5 minute expiry)
  6. Sends OTP via SMS
  7. Sends backup OTP via email
- **Output:** Generic success message (security: don't reveal if user exists)
- **Logging:** Comprehensive `[AUTH]` prefixed logs at each step

### newPassword(values, token)
- **Location:** `actions/auth.actions.ts` (lines 440-531)
- **Input:** `{ password: string }`, `token: string`
- **Process:**
  1. Validates token exists and not expired
  2. Validates password meets requirements
  3. Hashes new password
  4. Updates user password in database
  5. Deletes used token
- **Output:** Success message or error
- **Logging:** Comprehensive `[AUTH]` prefixed logs at each step

## 📊 Detailed Flow Chart

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PASSWORD RESET FLOW                              │
└─────────────────────────────────────────────────────────────────────┘

User Status: Logged Out OR Logged In (both work!)
                    │
                    ↓
    ┌───────────────────────────────┐
    │ /auth/forgot-password         │ ← Accessible to EVERYONE
    │ Enter: email/phone/clientId   │
    └───────────────┬───────────────┘
                    │
                    ↓
    ┌───────────────────────────────┐
    │ resetPassword(identifier)     │
    │ - Find user                   │
    │ - Generate token (1 hour)     │
    │ - Generate OTP (5 min)        │
    └───────────────┬───────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ↓                       ↓
┌──────────────┐       ┌──────────────┐
│ Email sent   │       │ SMS sent     │
│ Reset link   │       │ OTP code     │
└──────┬───────┘       └──────┬───────┘
        │                       │
        │                       │
        └───────────┬───────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
        ↓                        ↓
┌──────────────────┐    ┌──────────────────┐
│ User clicks link │    │ User uses OTP    │
│ (email)          │    │ (future feature) │
└────────┬─────────┘    └──────────────────┘
         │
         ↓
┌────────────────────────────┐
│ /auth/password-reset       │ ← Accessible to EVERYONE
│ ?token=...                 │
│ Enter new password         │
└───────────┬────────────────┘
            │
            ↓
┌───────────────────────────┐
│ newPassword(password,     │
│             token)        │
│ - Verify token            │
│ - Check expiry            │
│ - Hash password           │
│ - Update DB               │
│ - Delete token            │
└───────────┬───────────────┘
            │
            ↓
    ┌───────────────┐
    │ Success!      │
    │ Login with    │
    │ new password  │
    └───────────────┘
```

## 🔒 Security Features

### User Enumeration Prevention
- Returns generic success message whether user exists or not
- Prevents attackers from discovering valid accounts

### Token Security
- **Reset Token:** UUID v4, 1 hour expiry, single-use
- **OTP:** 6-digit numeric, 5 minute expiry, hashed storage
- Both deleted after successful use

### Multi-Channel Delivery
- Email: Reset link (primary)
- SMS: OTP code (alternative)
- Email: OTP backup (fallback)

### Rate Limiting
- OTP attempts tracked in database
- Lock after too many failed attempts

## 🐛 Console Logging

All operations log with `[AUTH]` prefix for easy debugging:

```bash
# Forgot password request
[AUTH] 🔄 resetPassword called with identifier: tes***
[AUTH] 🔍 Searching for user...
[AUTH] ✅ User found: ID=xyz, Email=Yes, Phone=Yes
[AUTH] 📧 Attempting to send password reset email...
[AUTH] ✅ Password reset email sent successfully
[AUTH] 📱 Attempting to send password reset OTP via SMS...
[AUTH] ✅ Password reset OTP sent successfully
[AUTH] ✅ resetPassword completed

# Password reset
[AUTH] 🔄 newPassword called with token: abc123...
[AUTH] ✅ Token present, validating password fields...
[AUTH] 🔍 Looking up password reset token in database...
[AUTH] ✅ Token found: ID=123, Email=user@example.com
[AUTH] ✅ Token is valid and not expired
[AUTH] 🔐 Hashing new password...
[AUTH] 💾 Updating user password in database...
[AUTH] 🗑️ Deleting used password reset token...
[AUTH] ✅ newPassword completed successfully
```

## 🧪 Testing

See [AUTH_TESTING_CHECKLIST.md](./AUTH_TESTING_CHECKLIST.md) for comprehensive test cases.

**Critical tests:**
- [ ] Forgot password works when logged OUT
- [ ] Forgot password works when logged IN (CRITICAL!)
- [ ] Reset link works in email
- [ ] Token expiry handled correctly
- [ ] Invalid token shows error
- [ ] New password saves correctly

## 📝 Notes

### Middleware Configuration
- Password reset routes are in `passwordResetRoutes[]` array
- Checked BEFORE auth route redirect logic
- Explicitly allowed for all users regardless of login state

### Token Expiry
- Email reset token: 1 hour (configurable)
- SMS OTP: 5 minutes (configurable)
- Both cleaned up after use or expiry

### User Experience
- Clear success/error messages
- Loading states during submission
- Helpful hints about token validity
- Link back to request new reset

## 🔗 Related Documentation

- [AUTH_MODULE_COMPLETE_GUIDE.md](./AUTH_MODULE_COMPLETE_GUIDE.md) - Complete auth system documentation
- [AUTH_TESTING_CHECKLIST.md](./AUTH_TESTING_CHECKLIST.md) - Testing guide
- [../AUTH_QUICK_REFERENCE.md](../AUTH_QUICK_REFERENCE.md) - Quick reference

---

**Last Updated:** 2025-10-07  
**Issue Fixed:** Password reset routes now accessible to all users  
**Status:** ✅ Production Ready
