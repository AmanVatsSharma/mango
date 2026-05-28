/**
 * @file login/page.tsx
 * @module app/(main)/auth
 * @description Auth login route entry rendering the mobile-first auth flow.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-01 — Suspense for useSearchParams in MobileAuthFlow (credential error codes).
 */

import MobileAuthFlow from '@/components/auth/MobileAuthFlow'
import React, { Suspense } from 'react'

const LoginPage = () => {
    return (
        <Suspense fallback={null}>
            <MobileAuthFlow initialStep="login" />
        </Suspense>
    )
}

export default LoginPage