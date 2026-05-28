/**
 * @file register/page.tsx
 * @module app/(main)/auth
 * @description Auth registration route entry rendering the mobile-first auth flow.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-05-11 — Added simple registration support
 */

import MobileAuthFlow from '@/components/auth/MobileAuthFlow'
import SimpleRegistrationForm from '@/components/auth/SimpleRegistrationForm'
import { isSimpleRegistrationEnabled } from '@/lib/server/workers/system-settings'
import React, { Suspense } from 'react'


const RegisterPage = async () => {
    // Check if simple registration is enabled
    const simpleRegistration = await isSimpleRegistrationEnabled()

    if (simpleRegistration) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <SimpleRegistrationForm />
            </div>
        )
    }

    return (
        <Suspense fallback={null}>
            <MobileAuthFlow initialStep="register" />
        </Suspense>
    )
}

export default RegisterPage