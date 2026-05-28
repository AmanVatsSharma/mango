"use client"

/**
 * @file email-verification/page.tsx
 * @module app/(main)/auth
 * @description Email verification shell with responsive desktop split layout.
 * @author StockTrade
 * @created 2026-02-16
 */

import EmailVerification from '@/components/auth/EmailVerification'
import React, { Suspense } from 'react'

const EmailVerificationPage = () => {
    return (
        <Suspense fallback={
            <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4">
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-6 py-5 text-sm text-slate-600 shadow-sm backdrop-blur-md">
                    Loading verification status...
                </div>
            </div>
        }>
            <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 sm:p-6 lg:p-8">
                <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    <div className="hidden lg:flex min-h-[500px] rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-8 text-white shadow-2xl">
                        <div className="flex flex-col justify-between">
                            <div className="space-y-4">
                                <h2 className="text-3xl font-bold leading-tight">Verify your email to activate secure trading features.</h2>
                                <p className="text-sm text-slate-200/90">
                                    Email verification helps protect your account and enables complete dashboard access.
                                </p>
                            </div>
                            <div className="space-y-2 text-sm text-slate-200/90">
                                <p>• Fast one-click verification process</p>
                                <p>• Recovery options if the link expires</p>
                                <p>• Improved account safety and notification delivery</p>
                            </div>
                        </div>
                    </div>

                    <div className="w-full max-w-md md:max-w-lg xl:max-w-xl mx-auto lg:mx-0 lg:justify-self-end">
                        <EmailVerification />
                    </div>
                </div>
            </div>
        </Suspense>
    )
}

export default EmailVerificationPage