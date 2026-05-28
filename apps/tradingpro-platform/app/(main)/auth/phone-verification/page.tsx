/**
 * @file phone-verification/page.tsx
 * @module app/(main)/auth
 * @description Phone verification route entry mapped to OTP step in mobile auth flow.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-02 — Suspense for useSearchParams in MobileAuthFlow.
 */

import MobileAuthFlow from '@/components/auth/MobileAuthFlow'
import React, { Suspense } from 'react'

const PhoneVerificationPage = () => {
    return (
        <Suspense fallback={null}>
            <MobileAuthFlow initialStep="otp" />
        </Suspense>
    )
}

export default PhoneVerificationPage
