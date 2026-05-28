### OTP Flow (SMS + Email)

All OTPs are now sent via both SMS and Email (when email exists) across registration, login, phone verification, mPin setup, mPin reset, and resend.

#### Source of Truth
- Service: `lib/otp-service.ts` → `OtpService.generateAndSendOtp`
- Email sender: `lib/ResendMail.ts` → `sendOtpEmail`
- SMS sender: `lib/aws-sns.ts` → `sendOtpSMS`

#### Behavior
- Generate OTP and store hashed version in DB via transaction.
- Send SMS to the provided phone.
- If the user has an email, enqueue an email send (non-blocking, best-effort). Response `data.emailEnqueued` indicates email was queued.
- If SMS fails, still return success with `data.fallback=true` to allow user to proceed, with server logs for support.

#### Sequence (Registration example)
```
Client -> API: registerWithMobile
API -> DB: create user, tradingAccount, default KYC
API -> OtpService.generateAndSendOtp(userId, phone, PHONE_VERIFICATION)
OtpService -> DB: save OTP
OtpService -> SNS: send SMS
OtpService -> Resend: send Email (if email exists, async)
API -> Client: sessionToken, requiresOtp=true, success message mentions SMS+Email
```

#### UI/Copy
- Action responses include email mention when `emailEnqueued` is true.
- Resend paths mirror the same behavior.


