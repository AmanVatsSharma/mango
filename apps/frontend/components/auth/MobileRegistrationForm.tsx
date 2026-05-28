/**
 * File: components/auth/MobileRegistrationForm.tsx
 * Module: components/auth
 * Purpose: Mobile registration form (name/email/phone/password) with OTP follow-up.
 * Author: StockTrade
 * Last-updated: 2026-02-11
 * Notes:
 * - User-facing copy is sourced from Branding constants.
 */

"use client"
import React, { useState, useTransition } from 'react'
import CardWrapper from './CardWrapper'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { signUpSchema } from '@/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import FormError from '../form-error'
import FormSucess from '../form-sucess'
import { registerWithMobile } from '@/actions/mobile-auth.actions'
import { User, Mail, Smartphone, Lock, Eye, EyeOff, Info } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { BRAND_IDENTITY } from "@/Branding"
import { getAuthRoute } from "@/lib/branding-routes"

interface MobileRegistrationFormProps {
  onRegistrationSuccess: (data: any) => void;
}

const MobileRegistrationForm: React.FC<MobileRegistrationFormProps> = ({ onRegistrationSuccess }) => {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>("")
  const [success, setSuccess] = useState<string | undefined>("")
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
    }
  })

  const onSubmit = (values: z.infer<typeof signUpSchema>) => {
    setError("")
    setSuccess("")

    startTransition(() => {
      registerWithMobile(values)
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
            
            if (data.requiresOtp || data.sessionToken) {
              // Pass control to parent component for OTP verification
              onRegistrationSuccess(data)
            }
          }
        })
        .catch((error) => {
          console.error("Registration error:", error)
          setError("Something went wrong! Please try again.")
        })
    })
  }

  return (
    <CardWrapper
      headerLabel={`Create your ${BRAND_IDENTITY.names.full} account`}
      backButtonLabel="Already have an account? Sign in"
      backButtonHref={getAuthRoute("login")}
      showSocial={false}
    >
      {/* Guidance banner clarifying next steps */}
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800 flex">
        <Info className="mt-0.5 mr-2 w-4 h-4 shrink-0" />
        <div>
          After creating your account, we'll send an OTP to verify your mobile. You'll also receive your Client ID for login.
        </div>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          <div className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700 font-medium">
                    Full Name
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <Input
                        {...field}
                        disabled={isPending}
                        placeholder="Enter your full name"
                        type='text'
                        className="pl-10 border-slate-300 focus:border-primary focus:ring focus:ring-primary/20 focus:ring-opacity-50 rounded-md shadow-sm"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                  <div className="text-xs text-gray-500 mt-1">
                    Use your full legal name as per PAN card
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700 font-medium">
                    Email Address
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <Input
                        {...field}
                        disabled={isPending}
                        placeholder="Enter your email address"
                        type='email'
                        className="pl-10 border-slate-300 focus:border-primary focus:ring focus:ring-primary/20 focus:ring-opacity-50 rounded-md shadow-sm"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='phone'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700 font-medium">
                    Mobile Number
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
                      <div className="flex relative">
                        <span className="inline-flex items-center pl-10 pr-3 rounded-l-md border border-r-0 border-slate-300 bg-gray-50 text-gray-500 text-sm">
                          +91
                        </span>
                        <Input
                          {...field}
                          disabled={isPending}
                          placeholder="9876543210"
                          type='tel'
                          maxLength={10}
                          className="pl-3 rounded-l-none border-slate-300 focus:border-primary focus:ring focus:ring-primary/20 focus:ring-opacity-50 rounded-r-md shadow-sm"
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 10)
                            field.onChange(value)
                          }}
                        />
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                  <div className="text-xs text-gray-500 mt-1">
                    Must start with 6-9 and be exactly 10 digits
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
                        placeholder="Create a strong password"
                        type={showPassword ? 'text' : 'password'}
                        className="pl-10 pr-10 border-slate-300 focus:border-primary focus:ring focus:ring-primary/20 focus:ring-opacity-50 rounded-md shadow-sm"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                  <div className="text-xs text-gray-500 mt-1">
                    Password must be 8-32 characters long
                  </div>
                </FormItem>
              )}
            />
          </div>

          <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-md">
            <p className="font-semibold mb-1">By creating an account, you agree to:</p>
            <ul className="space-y-1">
              <li>{`• ${BRAND_IDENTITY.names.full} Terms of Service`}</li>
              <li>• Privacy Policy and Data Protection</li>
              <li>• Trading Guidelines and Risk Disclosure</li>
            </ul>
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
                Creating account...
              </div>
            ) : (
              `Create ${BRAND_IDENTITY.names.full} Account`
            )}
          </Button>

          <div className="text-center text-sm text-gray-600 mt-4">
            <p>🔒 Bank-grade security with end-to-end encryption</p>
            <p className="mt-1">📱 Quick setup with instant mobile verification</p>
          </div>
        </form>
      </Form>
    </CardWrapper>
  )
}

export default MobileRegistrationForm
