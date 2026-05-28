/**
 * File: components/auth/MobileLoginForm.tsx
 * Module: components/auth
 * Purpose: Mobile login form (Mobile/Client ID + password).
 * Author: StockTrade
 * Last-updated: 2026-02-11
 * Notes:
 * - User-facing copy refers to StockTrade.
 */

"use client"
import React, { useEffect, useState, useTransition } from 'react'
import CardWrapper from './CardWrapper'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { mobileSignInSchema } from '@/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import FormError from '../form-error'
import FormSucess from '../form-sucess'
import { mobileLogin } from '@/actions/mobile-auth.actions'
import Link from 'next/link'
import { Smartphone, Lock, Eye, EyeOff, Info } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { BRAND_IDENTITY } from "@/Branding"
import { getAuthRoute } from "@/lib/branding-routes"

interface MobileLoginFormProps {
  onLoginSuccess: (data: any) => void;
  /** e.g. NextAuth redirect ?error=CredentialsSignin&code=ACCOUNT_* */
  initialBannerError?: string;
}

const MobileLoginForm: React.FC<MobileLoginFormProps> = ({ onLoginSuccess, initialBannerError }) => {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>("")
  const [success, setSuccess] = useState<string | undefined>("")
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (initialBannerError) setError(initialBannerError)
  }, [initialBannerError])

  const form = useForm<z.infer<typeof mobileSignInSchema>>({
    resolver: zodResolver(mobileSignInSchema),
    defaultValues: {
      identifier: "",
      password: "",
    }
  })

  const onSubmit = (values: z.infer<typeof mobileSignInSchema>) => {
    setError("")
    setSuccess("")

    startTransition(() => {
      mobileLogin(values)
        .then((data) => {
          if (data.error) {
            setError(data.error)
          }
          if (data.success) {
            setSuccess(data.success)
            if (data.userData?.emailError) {
              toast({
                title: "OTP email delivery issue",
                description: data.userData.emailError,
                variant: "destructive",
              })
            }

            if (data.requiresOtp || data.requiresMpin || data.sessionToken) {
              // Pass control to parent component for next steps
              onLoginSuccess(data)
            } else if (data.redirectTo) {
              // Handle direct redirects (like KYC)
              router.push(data.redirectTo)
            }
          }
        })
        .catch((error) => {
          console.error("Mobile login error:", error)
          setError("Something went wrong! Please try again.")
        })
    })
  }

  return (
    <CardWrapper
      headerLabel={`Welcome to ${BRAND_IDENTITY.names.short}`}
      backButtonLabel={`New to ${BRAND_IDENTITY.names.short}? Create account`}
      backButtonHref={getAuthRoute("register")}
      showSocial={false}
    >
      {/* Guidance banner */}
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800 flex">
        <Info className="mt-0.5 mr-2 w-4 h-4 shrink-0" />
        <div>
          Use your Mobile or Client ID and password. You may be asked for OTP and mPin.
        </div>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          <div className='space-y-4'>
            <FormField
              control={form.control}
              name='identifier'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700 font-medium">
                    Mobile Number or Client ID
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <Input
                        {...field}
                        disabled={isPending}
                        placeholder="9876543210 or AB1234"
                        type='text'
                        className="pl-10 border-slate-300 focus:border-primary focus:ring focus:ring-primary/20 focus:ring-opacity-50 rounded-md shadow-sm"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                  <div className="text-xs text-gray-500 mt-1">
                    Client ID will be sent to your email after registration
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700 font-medium">
                    Password
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <Input
                        {...field}
                        disabled={isPending}
                        placeholder="••••••••"
                        type={showPassword ? 'text' : 'password'}
                        className="pl-10 pr-10 border-slate-300 focus:border-primary focus:ring focus:ring-primary/20 focus:ring-opacity-50 rounded-md shadow-sm"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-primary focus:ring-primary border-slate-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                Remember me
              </label>
            </div>
            <div className="text-sm">
              <Link href={getAuthRoute("forgotPassword")} className="font-medium text-primary hover:opacity-90">
                Forgot password?
              </Link>
            </div>
          </div>

          <FormError message={error} />
          <FormSucess message={success} />

          <Button
            disabled={isPending}
            type='submit'
            className="w-full bg-primary hover:opacity-90 text-white font-bold py-3 px-4 rounded-md transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg"
          >
            {isPending ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </div>
            ) : (
              `Sign in to ${BRAND_IDENTITY.names.short}`
            )}
          </Button>

          <div className="text-center text-sm text-gray-600 mt-4">
            <p>🔒 Secure login with OTP & mPin verification</p>
            <p className="mt-1">💡 Use your mobile number or Client ID</p>
          </div>
        </form>
      </Form>
    </CardWrapper>
  )
}

export default MobileLoginForm
