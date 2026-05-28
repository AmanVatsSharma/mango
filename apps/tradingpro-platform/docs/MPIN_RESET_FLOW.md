# mPin Reset Flow

This document outlines the mPin reset process using OTP verification.

## UI
- `components/auth/MpinForm.tsx`
  - "Forgot mPin?" button requests an OTP and navigates back to the OTP step.
- `components/auth/OtpVerificationForm.tsx`
  - Verifies OTP with purpose `MPIN_RESET`. On success, parent moves to `mpin-setup` step (reusing the setup form for reset).

## Server
- `requestMpinResetOtp(sessionToken)` in `actions/mobile-auth.actions.ts`
  - Sends OTP with purpose `MPIN_RESET`
- `verifyOtp(values)` in `actions/mobile-auth.actions.ts`
  - Now handles `MPIN_RESET` and returns `userData.canSetupMpin = true`
- `setupMpin(values, sessionToken)` in `actions/mobile-auth.actions.ts`
  - Detects existing mPin and calls `MpinService.resetMpin` instead of setup

## Flow Chart
```
[MpinForm: Forgot mPin] -> requestMpinResetOtp
      |
      v
[OTP sent to phone]
      |
      v
[OtpVerificationForm: verifyOtp (MPIN_RESET)] -> [success]
      |
      v
[MobileAuthFlow -> setCurrentStep('mpin-setup')]
      |
      v
[setupMpin (internally resetMpin when existing)] -> [success]
```

## Notes
- Rate limits and attempt tracking are enforced in OTP service.
- Generic error messages avoid leaking account state.
