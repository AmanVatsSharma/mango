/**
 * @file mpin-setup/page.tsx
 * @module app/(main)/auth
 * @description MPIN setup route entry for first-time secure trading access.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-02 — Suspense for useSearchParams in MobileAuthFlow.
 */

import MobileAuthFlow from '@/components/auth/MobileAuthFlow'
import React, { Suspense } from 'react'

const MpinSetupPage = () => {
    return (
        <Suspense fallback={null}>
            <MobileAuthFlow initialStep="mpin-setup" />
        </Suspense>
    )
}

export default MpinSetupPage
