# Authentication Module - Testing Checklist

> **Purpose:** Comprehensive testing checklist for the authentication module  
> **Last Updated:** 2025-10-07

---

## 🎯 Overview

This document provides a systematic testing checklist for all authentication flows. Use this to verify that the auth module is working correctly after any changes.

---

## 📋 Pre-Test Setup

### Environment Verification

- [ ] `.env` file configured with all required variables
  - [ ] `DATABASE_URL` - PostgreSQL connection string
  - [ ] `NEXTAUTH_URL` - Application URL
  - [ ] `NEXTAUTH_SECRET` - Secret key for JWT
  - [ ] `RESEND_API_KEY` - Email service API key
  - [ ] `AWS_SNS_ACCESS_KEY_ID` - SMS service access key
  - [ ] `AWS_SNS_SECRET_ACCESS_KEY` - SMS service secret key
  - [ ] `AWS_SNS_REGION` - AWS region

- [ ] Database is running and accessible
- [ ] Database migrations are up to date
- [ ] Test user accounts exist in database
- [ ] Email service (Resend) is configured and working
- [ ] SMS service (AWS SNS) is configured and working

### Test Accounts

Create these test accounts for comprehensive testing:

```sql
-- Test user 1: Complete profile
INSERT INTO "User" (id, name, email, phone, password, emailVerified, phoneVerified, "mPin", clientId)
VALUES (
  'test-user-1',
  'Test User Complete',
  'test1@example.com',
  '+1234567890',
  '$2a$10$hashedpassword', -- 'password123'
  NOW(),
  true,
  '$2a$10$hashedmpin',     -- '1234'
  'AB1234'
);

-- Test user 2: Email not verified
INSERT INTO "User" (id, name, email, phone, password, emailVerified, phoneVerified, clientId)
VALUES (
  'test-user-2',
  'Test User Email Pending',
  'test2@example.com',
  '+1234567891',
  '$2a$10$hashedpassword',
  NULL,
  false,
  'AB1235'
);

-- Test user 3: Phone not verified
INSERT INTO "User" (id, name, email, phone, password, emailVerified, phoneVerified, clientId)
VALUES (
  'test-user-3',
  'Test User Phone Pending',
  'test3@example.com',
  '+1234567892',
  '$2a$10$hashedpassword',
  NOW(),
  false,
  'AB1236'
);
```

---

## 1️⃣ Registration Flow

### Test Case 1.1: Successful Registration

**Steps:**
1. [ ] Navigate to `/auth/register`
2. [ ] Enter valid details:
   - Name: "New Test User"
   - Email: "newuser@example.com"
   - Phone: "+1234567893" (optional)
   - Password: "SecurePass123!"
3. [ ] Click "Register" button
4. [ ] Verify success message appears
5. [ ] Verify Client ID is displayed
6. [ ] Check that verification email was sent
7. [ ] Check console logs for `[AUTH]` registration logs

**Expected Result:**
- ✅ User created in database
- ✅ Trading account created
- ✅ Verification email sent
- ✅ Success message with Client ID displayed
- ✅ Redirected to email verification page

**Console Logs to Check:**
```
[AUTH] 🔄 register called...
[AUTH] ✅ User created...
[AUTH] ✅ Trading account created...
[AUTH] 📧 Verification email sent...
```

### Test Case 1.2: Duplicate Email

**Steps:**
1. [ ] Navigate to `/auth/register`
2. [ ] Enter email that already exists
3. [ ] Click "Register"

**Expected Result:**
- ❌ Error: "Email already registered"
- 🔄 Form remains on page
- 📝 No database changes

### Test Case 1.3: Invalid Data

**Test invalid inputs:**
- [ ] Empty name → Error
- [ ] Invalid email format → Error
- [ ] Password too short (< 8 chars) → Error
- [ ] Password too long (> 32 chars) → Error
- [ ] Invalid phone format → Error

---

## 2️⃣ Login Flow

### Test Case 2.1: Successful Login (Complete Profile)

**Steps:**
1. [ ] Navigate to `/auth/login`
2. [ ] Enter credentials for complete user
3. [ ] Click "Sign in"

**Expected Result:**
- ✅ Redirected to `/dashboard`
- ✅ Session created
- ✅ All verification checks passed

**Console Logs:**
```
[AUTH] 🔄 login called...
[AUTH] ✅ User found...
[AUTH] ✅ Password correct...
[AUTH] ✅ Email verified...
[AUTH] ✅ Phone verified...
[AUTH] ✅ mPin set...
[AUTH] ✅ KYC approved...
[MIDDLEWARE] 🔍 Request to: /dashboard, Logged in: true
[MIDDLEWARE] ✅ User verification checks passed
```

### Test Case 2.2: Email Not Verified

**Steps:**
1. [ ] Login with user who hasn't verified email
2. [ ] Check redirect destination

**Expected Result:**
- ⚠️ New verification email sent
- 🔄 Redirected to email verification page
- 📧 Email with new token sent

### Test Case 2.3: Phone Not Verified

**Steps:**
1. [ ] Login with user who has verified email but not phone
2. [ ] Check redirect destination

**Expected Result:**
- 🔄 Redirected to `/auth/phone-verification`
- 📱 Can request OTP

### Test Case 2.4: mPin Not Set

**Steps:**
1. [ ] Login with user who has email + phone verified but no mPin
2. [ ] Check redirect destination

**Expected Result:**
- 🔄 Redirected to `/auth/mpin-setup`
- 🔐 Can set mPin

### Test Case 2.5: KYC Not Approved

**Steps:**
1. [ ] Login with user who has everything except KYC
2. [ ] Check redirect destination

**Expected Result:**
- 🔄 Redirected to `/auth/kyc`
- 📄 Can submit KYC documents

### Test Case 2.6: Invalid Credentials

**Test scenarios:**
- [ ] Wrong password → Error
- [ ] Non-existent email → Error
- [ ] Empty fields → Validation errors

---

## 3️⃣ Password Reset Flow

### ⚠️ CRITICAL: Test Both Logged-In and Logged-Out States

### Test Case 3.1: Forgot Password (Logged OUT)

**Steps:**
1. [ ] Ensure logged out
2. [ ] Navigate to `/auth/forgot-password`
3. [ ] Verify page loads successfully
4. [ ] Enter email address
5. [ ] Click "Send reset instructions"
6. [ ] Check success message
7. [ ] Check email inbox
8. [ ] Check SMS if phone number exists
9. [ ] Check console logs

**Expected Result:**
- ✅ Page accessible while logged out
- ✅ Success message displayed
- ✅ Reset email sent
- ✅ SMS OTP sent (if phone exists)
- ✅ No errors in console

**Console Logs:**
```
[MIDDLEWARE] 🔍 Request to: /auth/forgot-password, Logged in: false
[MIDDLEWARE] 🔓 Password reset route - allowing access for all users
[AUTH] 🔄 resetPassword called with identifier: tes***
[AUTH] 🔍 Searching for user...
[AUTH] ✅ User found...
[AUTH] 📧 Attempting to send password reset email...
[AUTH] ✅ Password reset email sent successfully...
[AUTH] 📱 Attempting to send password reset OTP via SMS...
[AUTH] ✅ Password reset OTP sent successfully...
```

### Test Case 3.2: Forgot Password (Logged IN) 🔥 CRITICAL

**Steps:**
1. [ ] Login with any test account
2. [ ] Navigate to `/auth/forgot-password`
3. [ ] **VERIFY PAGE LOADS (No redirect!)**
4. [ ] Enter identifier
5. [ ] Submit form
6. [ ] Verify success message

**Expected Result:**
- ✅ **Page accessible even when logged in**
- ✅ No redirect to dashboard
- ✅ Form submits successfully
- ✅ Reset instructions sent

**Console Logs:**
```
[MIDDLEWARE] 🔍 Request to: /auth/forgot-password, Logged in: true
[MIDDLEWARE] 🔓 Password reset route - allowing access for all users
[MIDDLEWARE] ✅ Request allowed - proceeding to /auth/forgot-password
```

**❌ FAILURE INDICATORS:**
- Page redirects to dashboard
- Page redirects to any verification page
- Console shows middleware blocking access

### Test Case 3.3: Password Reset with Email Token

**Steps:**
1. [ ] Complete forgot password flow
2. [ ] Open reset email
3. [ ] Click reset link
4. [ ] Verify `/auth/password-reset?token=...` page loads
5. [ ] Enter new password
6. [ ] Click "Update password"
7. [ ] Verify success message
8. [ ] Test login with new password

**Expected Result:**
- ✅ Reset page loads with token
- ✅ New password accepted
- ✅ Token deleted from database
- ✅ Can login with new password

**Console Logs:**
```
[AUTH] 🔄 newPassword called with token: abc123...
[AUTH] ✅ Token present, validating password fields...
[AUTH] 🔍 Looking up password reset token in database...
[AUTH] ✅ Token found...
[AUTH] ✅ Token is valid and not expired
[AUTH] 🔐 Hashing new password...
[AUTH] 💾 Updating user password in database...
[AUTH] 🗑️ Deleting used password reset token...
[AUTH] ✅ newPassword completed successfully
```

### Test Case 3.4: Expired Token

**Steps:**
1. [ ] Generate password reset token
2. [ ] Wait for expiry OR manually expire in database
3. [ ] Try to use expired token
4. [ ] Verify error message

**Expected Result:**
- ❌ Error: "Reset link has expired"
- 🗑️ Token deleted from database
- 📝 User prompted to request new reset

### Test Case 3.5: Invalid Token

**Steps:**
1. [ ] Navigate to `/auth/password-reset?token=invalid-token-123`
2. [ ] Try to submit form

**Expected Result:**
- ❌ Error: "Invalid or expired reset link"
- 🔄 Prompted to request new reset

### Test Case 3.6: Different Identifiers

**Test all identifier types:**

**Email:**
- [ ] Enter: `test1@example.com`
- [ ] Verify: User found, email sent

**Phone:**
- [ ] Enter: `+1234567890`
- [ ] Verify: User found, SMS sent

**Client ID:**
- [ ] Enter: `AB1234`
- [ ] Verify: User found, email + SMS sent

### Test Case 3.7: Non-existent User

**Steps:**
1. [ ] Enter identifier that doesn't exist
2. [ ] Submit form

**Expected Result:**
- ✅ Generic success message (security!)
- 🔒 Don't reveal if user exists
- 📝 No emails/SMS sent
- 📋 Logged appropriately

**Console Logs:**
```
[AUTH] ⚠️ User not found (returning generic success for security)
```

---

## 4️⃣ Email Verification

### Test Case 4.1: Verify Email with Valid Token

**Steps:**
1. [ ] Register new user
2. [ ] Get verification token from email
3. [ ] Visit verification link
4. [ ] Check success message
5. [ ] Verify `emailVerified` in database

**Expected Result:**
- ✅ Email marked as verified
- ✅ Success message shown
- ✅ Token deleted
- 🔄 Can proceed to login

### Test Case 4.2: Expired Verification Token

**Steps:**
1. [ ] Use expired verification token
2. [ ] Check error message

**Expected Result:**
- ❌ Error: "Verification link has expired"
- 📧 Prompted to request new verification email

---

## 5️⃣ Phone Verification

### Test Case 5.1: Request OTP

**Steps:**
1. [ ] Login and reach phone verification page
2. [ ] Click "Send OTP"
3. [ ] Check SMS delivery
4. [ ] Check backup email

**Expected Result:**
- ✅ OTP sent via SMS
- ✅ Backup OTP email sent
- ✅ OTP saved in database (hashed)
- ⏰ Expires in 5 minutes

### Test Case 5.2: Verify Valid OTP

**Steps:**
1. [ ] Request OTP
2. [ ] Enter correct OTP
3. [ ] Submit

**Expected Result:**
- ✅ Phone marked as verified
- ✅ OTP marked as used
- 🔄 Redirected to next step

### Test Case 5.3: Invalid OTP

**Steps:**
1. [ ] Enter wrong OTP
2. [ ] Submit

**Expected Result:**
- ❌ Error: "Invalid OTP"
- 📝 Attempt counter incremented
- 🔒 Locked after too many attempts

---

## 6️⃣ mPin Setup & Verification

### Test Case 6.1: Set mPin

**Steps:**
1. [ ] Reach mPin setup page
2. [ ] Enter 4-digit mPin
3. [ ] Confirm mPin
4. [ ] Submit

**Expected Result:**
- ✅ mPin saved (hashed)
- 🔄 Redirected to next step

### Test Case 6.2: mPin Verification

**Steps:**
1. [ ] Login with mobile app
2. [ ] Enter mPin
3. [ ] Verify

**Expected Result:**
- ✅ mPin verified
- 🔐 Session authenticated

---

## 7️⃣ Middleware Tests

### Test Case 7.1: Unauthenticated Access

**Test protected routes:**
- [ ] `/dashboard` → Redirect to login
- [ ] `/trading` → Redirect to login
- [ ] `/admin` → Redirect to login

### Test Case 7.2: Authenticated with Incomplete Profile

**Phone not verified:**
- [ ] Any protected route → Redirect to `/auth/phone-verification`

**mPin not set:**
- [ ] Any protected route → Redirect to `/auth/mpin-setup`

**KYC not approved:**
- [ ] Any protected route → Redirect to `/auth/kyc`

### Test Case 7.3: Password Reset Route Access 🔥 CRITICAL

**Logged OUT:**
- [ ] `/auth/forgot-password` → ✅ ALLOWED
- [ ] `/auth/password-reset?token=...` → ✅ ALLOWED

**Logged IN:**
- [ ] `/auth/forgot-password` → ✅ ALLOWED (NO REDIRECT!)
- [ ] `/auth/password-reset?token=...` → ✅ ALLOWED (NO REDIRECT!)

**Console Verification:**
```
[MIDDLEWARE] 🔓 Password reset route - allowing access for all users
```

### Test Case 7.4: Admin Route Access

**Non-admin user:**
- [ ] `/admin` → Redirect to `/dashboard`

**Admin user:**
- [ ] `/admin` → ✅ Access granted

---

## 8️⃣ Integration Tests

### Test Case 8.1: Complete New User Journey

**End-to-end flow:**
1. [ ] Register new account
2. [ ] Verify email
3. [ ] Login
4. [ ] Verify phone
5. [ ] Set mPin
6. [ ] Submit KYC
7. [ ] Access dashboard

**Expected:** Smooth flow through all steps

### Test Case 8.2: Password Reset Mid-Session

**Steps:**
1. [ ] Login successfully
2. [ ] Navigate to forgot password page
3. [ ] Reset password
4. [ ] Logout
5. [ ] Login with new password

**Expected:** All steps work seamlessly

---

## 9️⃣ Security Tests

### Test Case 9.1: SQL Injection Prevention

**Test inputs:**
- [ ] `' OR '1'='1` in email field
- [ ] `'; DROP TABLE users; --` in identifier

**Expected:** All inputs sanitized, no SQL injection

### Test Case 9.2: XSS Prevention

**Test inputs:**
- [ ] `<script>alert('XSS')</script>` in name field
- [ ] `<img src=x onerror=alert(1)>` in email

**Expected:** Scripts escaped, no XSS execution

### Test Case 9.3: Rate Limiting

**Steps:**
1. [ ] Send 10 OTP requests rapidly
2. [ ] Check rate limiting kicks in

**Expected:** Rate limited after threshold

### Test Case 9.4: Token Expiry

**Verify expiry times:**
- [ ] Email verification token → Expires as configured
- [ ] Password reset token → Expires after 1 hour
- [ ] OTP → Expires after 5 minutes

---

## 🔟 Error Handling Tests

### Test Case 10.1: Database Connection Failure

**Steps:**
1. [ ] Stop database
2. [ ] Try to login
3. [ ] Check error message

**Expected:** Graceful error, not server crash

### Test Case 10.2: Email Service Failure

**Steps:**
1. [ ] Disable email service
2. [ ] Try to register
3. [ ] Check error handling

**Expected:** Registration succeeds, email error logged

### Test Case 10.3: SMS Service Failure

**Steps:**
1. [ ] Disable SMS service
2. [ ] Request phone verification
3. [ ] Check fallback behavior

**Expected:** Graceful degradation, email backup sent

---

## 📊 Console Log Verification

### Expected Log Patterns

**Middleware logs:**
```
[MIDDLEWARE] 🔍 Request to: /auth/login, Logged in: false
[MIDDLEWARE] 📊 Route flags: {...}
[MIDDLEWARE] ✅ Request allowed
```

**Auth action logs:**
```
[AUTH] 🔄 login called...
[AUTH] ✅ User found...
[AUTH] ✅ Password correct...
[AUTH] ✅ Login successful
```

**Error logs:**
```
[AUTH] ❌ Login failed: Invalid credentials
[AUTH] 📋 Error details: {...}
```

---

## ✅ Test Completion Checklist

### Critical Tests (Must Pass)
- [ ] Registration flow works
- [ ] Login flow works with all user states
- [ ] **Password reset accessible when logged out**
- [ ] **Password reset accessible when logged in** 🔥
- [ ] Email verification works
- [ ] Phone verification works
- [ ] mPin setup works
- [ ] Middleware allows password reset routes
- [ ] Middleware blocks unauthorized access
- [ ] All console logs appear correctly

### Security Tests (Must Pass)
- [ ] Passwords are hashed
- [ ] Tokens expire correctly
- [ ] SQL injection prevented
- [ ] XSS prevented
- [ ] User enumeration prevented
- [ ] Rate limiting works

### User Experience Tests
- [ ] Error messages are clear
- [ ] Success messages are encouraging
- [ ] Redirects are smooth
- [ ] Loading states work
- [ ] Forms validate properly

---

## 📝 Test Results Template

```markdown
## Test Run: [Date]

### Environment
- Node version: 
- Database: 
- Email service: 
- SMS service: 

### Results

#### Registration Flow
- [ ] Test 1.1: ✅ PASS / ❌ FAIL - Notes: 
- [ ] Test 1.2: ✅ PASS / ❌ FAIL - Notes: 
- [ ] Test 1.3: ✅ PASS / ❌ FAIL - Notes: 

#### Login Flow
- [ ] Test 2.1: ✅ PASS / ❌ FAIL - Notes: 
- [ ] Test 2.2: ✅ PASS / ❌ FAIL - Notes: 
...

#### Password Reset Flow (CRITICAL)
- [ ] Test 3.1: ✅ PASS / ❌ FAIL - Notes: 
- [ ] Test 3.2: ✅ PASS / ❌ FAIL - Notes: 
- [ ] Test 3.3: ✅ PASS / ❌ FAIL - Notes: 
...

### Issues Found
1. [Issue description] - Severity: HIGH/MEDIUM/LOW
2. ...

### Recommendations
1. [Recommendation]
2. ...

### Sign-off
Tested by: 
Date: 
Status: ✅ APPROVED / ❌ NEEDS FIXES
```

---

## 🎯 Quick Test Script

For quick verification, use this minimal test:

```bash
# 1. Test registration
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"test1234"}'

# 2. Test forgot password (logged out)
curl http://localhost:3000/auth/forgot-password

# 3. Test forgot password form submission
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@test.com"}'

# 4. Check console logs for [MIDDLEWARE] and [AUTH] prefixes
```

---

**Last Updated:** 2025-10-07  
**Maintained By:** Development Team  
**Next Review:** When auth module changes are made
