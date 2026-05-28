/**
 * @file mpin-verify/page.tsx
 * @module app/(main)/auth
 * @description MPIN verification route entry for secure login continuation.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-02 — Suspense for useSearchParams in MobileAuthFlow.
 */

import MobileAuthFlow from '@/components/auth/MobileAuthFlow'
import React, { Suspense } from 'react'

const MpinVerifyPage = () => {
    return (
        <Suspense fallback={null}>
            <MobileAuthFlow initialStep="mpin-verify" />
        </Suspense>
    )
}

export default MpinVerifyPage
