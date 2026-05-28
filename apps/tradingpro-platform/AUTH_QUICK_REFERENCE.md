# Authentication System - Quick Reference Guide

## 🚀 Quick Start

### Complete User Journey

```
Registration → Email Verification → Phone Verification (OTP to SMS + Email)
    → mPin Setup → KYC Submission → Dashboard Access
```

## 📱 OTP Delivery Confirmation

**IMPORTANT**: OTP is ALWAYS sent to both channels simultaneously:
1. **SMS** via AWS SNS to user's mobile number
2. **Email** via Resend to user's email address

Check implementation in `lib/otp-service.ts` lines 69-120.

## 🔐 Authentication Flow States

### User Registration
```typescript
// Input: name, email, phone, password
// Output: Client ID + Email verification link
// Next: Email verification required
```

### Login States
| State | Redirect | OTP Sent To |
|-------|----------|-------------|
| Email not verified | Resend verification email | Email only |
| Phone not verified | Phone verification | SMS + Email |
| No mPin setup | mPin setup | SMS + Email |
| KYC not complete | KYC page | N/A |
| All complete | Dashboard | N/A |

## 🔄 API Endpoints Quick Reference

### Send OTP
```bash
POST /api/otp/send
Headers: Cookie (session)
Body: { purpose: "LOGIN_VERIFICATION" | "PHONE_VERIFICATION" | "MPIN_SETUP" | "MPIN_RESET" }
Response: { success: true, message: "OTP sent...", emailSent: true }
```

### Verify OTP
```bash
POST /api/otp/verify
Body: { otp: "123456", sessionToken: "..." }
Response: { success: true, message: "OTP verified", purpose: "..." }
```

### Setup mPin
```bash
POST /api/mpin/setup
Body: { mpin: "1234", confirmMpin: "1234", sessionToken: "..." }
Response: { success: true, message: "mPin set up successfully!" }
```

### Verify mPin
```bash
POST /api/mpin/verify
Body: { mpin: "1234", sessionToken: "..." }
Response: { success: true, message: "mPin verified!" }
```

### Submit KYC
```bash
POST /api/kyc
Headers: Cookie (session)
Body: {
  aadhaarNumber: "123456789012", // 12 digits
  panNumber: "ABCDE1234F",       // Format: XXXXX9999X
  bankProofUrl: "https://..."
}
Response: { success: "KYC submitted...", kyc: {...} }
```

### Get KYC Status
```bash
GET /api/kyc
Headers: Cookie (session)
Response: { kyc: { status: "PENDING" | "APPROVED" | "REJECTED", ... } }
```

## 🎯 Error Code Reference

### Common Error Codes
- `RATE_LIMITED` - Too many requests, wait before retrying
- `INVALID_OTP` - Wrong OTP entered
- `MAX_ATTEMPTS_EXCEEDED` - Too many failed attempts
- `OTP_NOT_FOUND` - No valid OTP exists, request new one
- `INVALID_CREDENTIALS` - Wrong email/phone/password

### HTTP Status Codes
- `400` - Bad request, invalid input
- `401` - Unauthorized, login required
- `403` - Forbidden, account locked or max attempts
- `429` - Rate limited, too many requests
- `500` - Server error, try again later

## 📝 Validation Rules

### Email
- Format: valid email address
- Example: `user@example.com`

### Phone (Indian Mobile)
- Format: 10 digits starting with 6-9
- Example: `9876543210`
- Stored as: `+919876543210`

### Password
- Length: 8-32 characters
- Requirements: Enforced by Zod schema

### mPin
- Length: 4-6 digits
- Format: Numbers only
- Example: `1234` or `123456`

### Aadhaar Number
- Length: Exactly 12 digits
- Format: Numbers only
- Example: `123456789012`

### PAN Number
- Format: 5 letters + 4 numbers + 1 letter
- Case: Uppercase
- Example: `ABCDE1234F`

### Client ID
- Format: 2 letters + 4 numbers (auto-generated)
- Example: `AB1234`

## 🔧 Server Actions

### Registration
```typescript
import { register } from "@/actions/auth.actions";

const result = await register({
  name: "John Doe",
  email: "john@example.com",
  phone: "9876543210",
  password: "SecurePass123"
});

// Result: { success: "...", clientId: "AB1234" }
// or     { error: "..." }
```

### Login
```typescript
import { login } from "@/actions/auth.actions";

const result = await login({
  email: "john@example.com", // or Client ID
  password: "SecurePass123"
});

// Result: { success: "...", redirectTo: "/..." }
// or     { error: "..." }
```

### Forgot Password
```typescript
import { resetPassword } from "@/actions/auth.actions";

const result = await resetPassword({
  identifier: "john@example.com" // or phone or clientId
});

// Result: { success: "Check your email..." }
// or     { error: "..." }
```

### Mobile Login
```typescript
import { mobileLogin } from "@/actions/mobile-auth.actions";

const result = await mobileLogin({
  identifier: "9876543210", // or clientId
  password: "SecurePass123"
});

// Result: { 
//   success: "...",
//   sessionToken: "...",
//   requiresOtp: true,
//   userData: {...}
// }
```

## 🛡️ Security Best Practices

### Rate Limiting
- OTP requests: 1 per minute per user
- Login attempts: Logged and monitored
- Session expiry: Configurable (default: 1 hour)

### Token Security
- Verification tokens: Expire in 1 hour
- Password reset tokens: Expire in 1 hour
- OTP tokens: Expire in 5 minutes
- Session tokens: Expire based on activity

### Password Security
- Hashed with bcrypt (10 rounds)
- Never logged or exposed
- Reset requires email/phone verification

### mPin Security
- Hashed with bcrypt
- Max 3 verification attempts
- Reset requires OTP verification
- Stored separately from password

## 🐛 Debugging Tips

### OTP Not Received
1. Check server logs for SMS/Email delivery
2. Verify AWS SNS credentials
3. Check Resend API key
4. In development: OTP logged to console

### Session Issues
1. Check cookie settings
2. Verify NextAuth configuration
3. Check session expiration
4. Clear browser cookies and retry

### KYC Upload Fails
1. Check file size (max limit)
2. Verify file format (image/pdf)
3. Ensure session is active
4. Check server logs for errors

### Login Redirects Incorrectly
1. Check middleware.ts for redirect rules
2. Verify user status in database
3. Check session data completeness
4. Review auth callback configuration

## 📊 Status Flow Diagram

```
NEW USER
   ├─→ Register
   ├─→ Verify Email (link sent to email)
   ├─→ Login
   ├─→ Verify Phone (OTP to SMS + Email)
   ├─→ Setup mPin (OTP to SMS + Email)
   ├─→ Submit KYC
   ├─→ Admin Approval
   └─→ Access Dashboard

RETURNING USER
   ├─→ Login
   ├─→ Verify OTP (OTP to SMS + Email)
   ├─→ Verify mPin
   └─→ Access Dashboard
```

## 🎨 UI Components

### Auth Pages
- `/auth/login` - Standard login
- `/auth/register` - New user registration
- `/auth/forgot-password` - Password reset request
- `/auth/password-reset` - New password entry
- `/auth/email-verification` - Email verification
- `/auth/phone-verification` - Phone OTP entry
- `/auth/otp-verification` - Generic OTP entry
- `/auth/mpin-setup` - mPin creation
- `/auth/mpin-verify` - mPin entry
- `/auth/kyc` - KYC document upload

### Protected Routes
Dashboard and trading routes require:
1. ✅ Email verified
2. ✅ Phone verified
3. ✅ mPin set up
4. ✅ KYC approved

## 💡 Common Patterns

### Check User Completion Status
```typescript
const session = await auth();
const user = session?.user as any;

const isComplete = 
  user?.phoneVerified && 
  user?.hasMpin && 
  user?.kycStatus === "APPROVED";
```

### Handle Auth Response
```typescript
const result = await someAuthAction(data);

if (result.error) {
  setError(result.error);
  return;
}

if (result.redirectTo) {
  router.push(result.redirectTo);
  return;
}

setSuccess(result.success);
```

### Resend OTP
```typescript
import { resendOtp } from "@/actions/mobile-auth.actions";

const result = await resendOtp(sessionToken);

if (result.success) {
  toast.success(result.success);
}
```

## 📞 Support Contacts

For issues with:
- **Email delivery**: Check Resend dashboard
- **SMS delivery**: Check AWS SNS logs
- **Database**: Check Prisma logs
- **Authentication**: Check NextAuth debug logs

## 🚦 Health Check

Test auth system health:
```bash
# Check API health
curl https://yourdomain.com/api/health

# Test OTP delivery (requires auth)
curl -X POST https://yourdomain.com/api/otp/send \
  -H "Content-Type: application/json" \
  -d '{"purpose": "LOGIN_VERIFICATION"}'
```

## 📚 Additional Resources

- Full documentation: `AUTH_SYSTEM_IMPROVEMENTS.md`
- API documentation: Individual route files
- Schema definitions: `schemas/index.ts`
- Service implementations: `lib/` directory
- Database schema: `prisma/schema.prisma`

---

**Last Updated**: 2025-10-05
**Version**: 1.0.0 (Enterprise Grade)
