/**
 * File:        components/auth/AuthSocial.tsx
 * Module:      Auth · Social login button row
 * Purpose:     OAuth provider buttons (Google, Apple, Facebook, Github) on the login screen.
 *
 * Exports:
 *   - default AuthSocial — props: none. Renders 4 provider buttons.
 *
 * Depends on:
 *   - next-auth/react.signIn — provider redirect
 *   - @/lib/branding-routes — auth callback URL
 *   - lucide-react — Apple/Facebook/Github icons (Wave 1 perf cleanup; replaces react-icons)
 *
 * Side-effects: triggers OAuth signIn redirect on click
 *
 * Key invariants:
 *   - The Google "G" logo is intentionally inlined as multi-color SVG to preserve brand
 *     fidelity without re-introducing the react-icons dependency.
 *
 * Read order:
 *   1. GoogleColorIcon — inline SVG
 *   2. AuthSocial — button row
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

"use client"
import React from 'react'
import { Button } from '../ui/button'
import { Apple, Facebook, Github } from 'lucide-react'
import { signIn } from "next-auth/react"
import { getAuthRoute } from "@/lib/branding-routes"

function GoogleColorIcon({ className = "h-5 w-5 mx-3" }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
        </svg>
    )
}

const AuthSocial = () => {
    const authCallbackRoute = `${getAuthRoute("root")}/auth-callback`
    return (
        <div className='grid grid-cols-1 gap-3 items-center w-full gap-x-2'>
            <Button
                size="lg"
                variant="outline"
                className="w-full items-center bg-white text-black border border-gray-300 hover:bg-gray-100"
                onClick={() => signIn('google', { callbackUrl: authCallbackRoute })}
            >
                <GoogleColorIcon />
                Continue with Google
            </Button>
            <Button
                onClick={() => signIn('apple', { callbackUrl: authCallbackRoute })}
                className="w-full items-center bg-black text-white hover:bg-gray-800"
            >
                <Apple className='h-5 w-5 mx-3' />
                Continue with Apple
            </Button>
            <Button
                onClick={() => signIn('facebook', { callbackUrl: authCallbackRoute })}
                className="w-full items-center bg-blue-600 text-white hover:bg-blue-700"
            >
                <Facebook className='h-5 w-5 mx-3' />
                Continue with Facebook
            </Button>

            <Button
                size="lg"
                variant="outline"
                className='w-full'
                onClick={() => { }}
            >
                <Github className='h-5 w-5' />
            </Button>

        </div>
    )
}

export default AuthSocial
