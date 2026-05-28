/**
 * File: components/auth/SimpleRegistrationForm.tsx
 * Module: components/auth
 * Purpose: Simple registration form (name/password/mpin only - no email/phone required)
 * Author: StockTrade
 * Created: 2026-05-11
 */

"use client"
import React, { useState, useTransition } from 'react'
import CardWrapper from './CardWrapper'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { simpleSignUpSchema } from '@/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import FormError from '../form-error'
import FormSucess from '../form-sucess'
import { registerSimple } from '@/actions/auth.actions'
import { User, Lock, Eye, EyeOff, Shield, Info, Copy, Check } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { BRAND_IDENTITY } from "@/Branding"
import { getAuthRoute } from "@/lib/branding-routes"

const SimpleRegistrationForm: React.FC = () => {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>("")
  const [success, setSuccess] = useState<string | undefined>("")
  const [clientId, setClientId] = useState<string | undefined>("")
  const [showPassword, setShowPassword] = useState(false)
  const [showMpin, setShowMpin] = useState(false)
  const [copied, setCopied] = useState(false)

  const form = useForm<z.infer<typeof simpleSignUpSchema>>({
    resolver: zodResolver(simpleSignUpSchema),
    defaultValues: {
      name: "",
      password: "",
      mpin: "",
      confirmMpin: "",
    }
  })

  const copyClientId = () => {
    if (clientId) {
      navigator.clipboard.writeText(clientId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const onSubmit = (values: z.infer<typeof simpleSignUpSchema>) => {
    setError("")
    setSuccess("")

    startTransition(() => {
      registerSimple(values)
        .then((data) => {
          if (data.error) {
            setError(data.error)
          }
          if (data.success) {
            setSuccess(data.success)
            setClientId(data.clientId)
            if (data.showClientId) {
              // User registered successfully - show clientId prominently
              toast({
                title: "Registration Successful!",
                description: "Please save your Client ID to login.",
                variant: "default",
              })
            }
          }
        })
        .catch((error) => {
          console.error("Registration error:", error)
          setError("Something went wrong! Please try again.")
        })
    })
  }

  // Show client ID prominently if registration was successful
  if (clientId && success) {
    return (
      <CardWrapper
        headerLabel="Registration Successful!"
        backButtonLabel="Go to Login"
        backButtonHref={getAuthRoute("login")}
        showSocial={false}
      >
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <Check className="w-12 h-12 mx-auto mb-2 text-green-600" />
            <h3 className="text-lg font-semibold text-green-800 mb-2">
              Account Created Successfully!
            </h3>
            <p className="text-sm text-green-700 mb-4">
              Please save your Client ID below. You will need it to login.
            </p>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">Your Client ID</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-3xl font-bold font-mono tracking-wider text-primary">
                {clientId}
              </span>
              <button
                onClick={copyClientId}
                className="p-2 hover:bg-primary/10 rounded-md transition-colors"
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <Copy className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
            <Info className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="text-sm text-amber-800">
              <strong>Important:</strong> This is the only time your Client ID will be shown. Please save it securely.
            </div>
          </div>

          <Button
            onClick={copyClientId}
            className="w-full"
            variant="outline"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy Client ID
              </>
            )}
          </Button>
        </div>
      </CardWrapper>
    )
  }

  return (
    <CardWrapper
      headerLabel={`Create your ${BRAND_IDENTITY.names.full} account`}
      backButtonLabel="Already have an account? Sign in"
      backButtonHref={getAuthRoute("login")}
      showSocial={false}
    >
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800 flex">
        <Info className="mt-0.5 mr-2 w-4 h-4 shrink-0" />
        <div>
          Quick signup! You'll receive a Client ID after registration. Save it to login.
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
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        {...field}
                        placeholder="Enter your full name"
                        className="pl-10"
                        disabled={isPending}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        {...field}
                        type={showPassword ? "text" : "password"}
                        placeholder="Create a password"
                        className="pl-10 pr-10"
                        disabled={isPending}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='mpin'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <div className="flex items-center gap-1">
                      <Shield className="w-4 h-4" />
                      Set MPIN (4-6 digits)
                    </div>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        {...field}
                        type={showMpin ? "text" : "password"}
                        placeholder="Enter 4-6 digit MPIN"
                        className="pl-10 pr-10"
                        maxLength={6}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        disabled={isPending}
                      />
                      <button
                        type="button"
                        onClick={() => setShowMpin(!showMpin)}
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                      >
                        {showMpin ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='confirmMpin'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm MPIN</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        {...field}
                        type="password"
                        placeholder="Confirm your MPIN"
                        className="pl-10"
                        maxLength={6}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        disabled={isPending}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {error && <FormError message={error} />}
          {success && <FormSuccess message={success} />}

          <Button type='submit' className='w-full' disabled={isPending}>
            {isPending ? "Creating Account..." : "Create Account"}
          </Button>
        </form>
      </Form>
    </CardWrapper>
  )
}

export default SimpleRegistrationForm