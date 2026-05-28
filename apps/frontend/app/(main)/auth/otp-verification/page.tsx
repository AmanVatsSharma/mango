/**
 * @file otp-verification/page.tsx
 * @module app/(main)/auth
 * @description OTP verification route entry for the mobile-first auth journey.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-02 — Suspense for useSearchParams in MobileAuthFlow.
 */

import MobileAuthFlow from '@/components/auth/MobileAuthFlow'
import React, { Suspense } from 'react'

const OtpVerificationPage = () => {
    return (
        <Suspense fallback={null}>
            <MobileAuthFlow initialStep="otp" />
        </Suspense>
    )
}

export default OtpVerificationPage
