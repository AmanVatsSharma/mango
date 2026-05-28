/**
 * @file EmailVerification.tsx
 * @module components/auth
 * @description Email token verification component with resend flow and status-driven UI states.
 * @author StockTrade
 * @created 2026-02-16
 */

'use client'
import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle as FaCheckCircle, AlertTriangle as FaExclamationTriangle, Mail as FaEnvelope } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { newVerification, resendVerificationEmailByToken } from '@/actions/auth.actions'
import { BRAND_IDENTITY, mailtoSupport } from "@/Branding"
// import { sendVerificationEmail } from '@/lib/ResendMail'


const EmailVerification = () => {
    const searchParams = useSearchParams();
    const [token, setToken] = useState<string | null>(null)
    // const [email, setEmail] = useState<string | null>(null)

    const [verificationStatus, setVerificationStatus] = useState<'pending' | 'success' | 'error'>('pending')
    const [errorMessage, setErrorMessage] = useState<string>()
    const [isResending, setIsResending] = useState(false)
    const [resendCooldown, setResendCooldown] = useState(0)

    useEffect(() => {
        // Check if we're on the client before accessing search params
        if (typeof window !== 'undefined') {
            setToken(searchParams?.get('token') ?? '123456')
            // setEmail(searchParams?.get('email') ?? 'test@email.com')
        }
    }, [searchParams])

    useEffect(() => {
        if (!token) return;

        const verifyEmail = async () => {
            try {
                const response = await newVerification(token);

                // Check if response exists
                if (!response) {
                    setVerificationStatus('error');
                    setErrorMessage("Unexpected error occured. Please try again.")
                    return;
                }

                // Handle the response
                if (response.success) {
                    console.log("Verification successful:", response.success);
                    confetti({
                        particleCount: 100,
                        spread: 70,
                        origin: { y: 0.6 }
                    });
                    setVerificationStatus('success');
                } else if (response.error) {
                    setVerificationStatus('error');
                    setErrorMessage(response.error)
                } else {
                    setVerificationStatus('error');
                    setErrorMessage("The link may have expired or been used already.")
                }
            } catch (error) {
                setVerificationStatus('error');
                setErrorMessage("Verification request failed.")
            }
        };

        verifyEmail();
    }, [token]);


    const resendVerificationEmail = async () => {
        try {
            setIsResending(true)
            if (!token) {
                setVerificationStatus('error')
                setErrorMessage("Missing token or broken link.")
                return
            }

            const response = await resendVerificationEmailByToken(token)
            if (!response) {
                setVerificationStatus('error')
                setErrorMessage("Unexpected error occurred. Please try again.")
                return
            }

            if (response.success) {
                setErrorMessage(response.success)
                setResendCooldown(60)

                const countdownInterval = setInterval(() => {
                    setResendCooldown((prevCooldown) => {
                        if (prevCooldown <= 1) {
                            clearInterval(countdownInterval)
                            return 0
                        }
                        return prevCooldown - 1
                    })
                }, 1000)
                return
            }

            setVerificationStatus('error')
            setErrorMessage(response.error || "Failed to resend verification email.")
        } catch (e) {
            setVerificationStatus('error')
            setErrorMessage("Failed to resend verification email.")
        } finally {
            setIsResending(false)
        }
    }




    return (
        <Card className="w-full max-w-lg lg:max-w-xl overflow-hidden shadow-xl border-0 bg-white/90 backdrop-blur-md">
            <CardHeader className="bg-green-600 text-white p-6 sm:p-7">
                <CardTitle className="text-2xl font-bold text-center">Email Verification</CardTitle>
            </CardHeader>
            <CardContent className="p-6 sm:p-7">
                <AnimatePresence mode="wait">
                    {verificationStatus === 'pending' && (
                        <motion.div
                            key="pending"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="text-center"
                        >
                            <FaEnvelope className="mx-auto text-6xl text-green-600 mb-4" />
                            <h2 className="text-xl font-semibold mb-2">Verifying your email</h2>
                            <p className="text-gray-600 mb-4">Please wait while we verify your email address...</p>
                            <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12 mb-4 mx-auto"></div>
                        </motion.div>
                    )}
                    {verificationStatus === 'success' && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="text-center"
                        >
                            <FaCheckCircle className="mx-auto text-6xl text-green-600 mb-4" />
                            <h2 className="text-xl font-semibold mb-2">Email Verified!</h2>
                            <p className="text-gray-600">{`Your email has been successfully verified. You can now access all features of ${BRAND_IDENTITY.names.full}.`}</p>
                        </motion.div>
                    )}
                    {verificationStatus === 'error' && (
                        <motion.div
                            key="error"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="text-center"
                        >
                            <FaExclamationTriangle className="mx-auto text-6xl text-yellow-500 mb-4" />
                            <h2 className="text-xl font-semibold mb-2">Verification Failed</h2>
                            <p className="text-gray-600 mb-4">We couldn&apos;t verify your email.</p>
                            <p>{errorMessage}</p>
                            <Button
                                onClick={resendVerificationEmail}
                                disabled={isResending || resendCooldown > 0}
                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-full transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg"
                            >
                                {isResending ? 'Resending...' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Verification Email'}
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
            <CardFooter className="bg-gray-50 p-4 sm:p-5">
                <p className="text-sm text-gray-600 text-center w-full">
                    If you&apos;re having trouble, please contact <a href={mailtoSupport()} className="text-green-600 hover:underline">{BRAND_IDENTITY.email.support}</a>
                </p>
            </CardFooter>
        </Card>
    )
}

export default EmailVerification