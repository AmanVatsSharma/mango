// components/auth/OtpVerificationForm.tsx
"use client"
import React, { useState, useTransition, useEffect } from 'react'
import CardWrapper from './CardWrapper'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { otpVerificationSchema } from '@/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import FormError from '../form-error'
import FormSucess from '../form-sucess'
import { verifyOtp, resendOtp } from '@/actions/mobile-auth.actions'
import { ShieldCheck, Clock, Copy, CheckCircle2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface OtpVerificationFormProps {
  sessionToken: string;
  userData: any;
  onVerificationSuccess: (data: any) => void;
  onBack: () => void;
}

const OtpVerificationForm: React.FC<OtpVerificationFormProps> = ({ 
  sessionToken, 
  userData, 
  onVerificationSuccess,
  onBack 
}) => {
  const [isPending, startTransition] = useTransition()
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState<string | undefined>("")
  const [success, setSuccess] = useState<string | undefined>("")
  const [timeLeft, setTimeLeft] = useState(300) // 5 minutes
  const [canResend, setCanResend] = useState(false)
  const [copied, setCopied] = useState(false)

  const form = useForm<z.infer<typeof otpVerificationSchema>>({
    resolver: zodResolver(otpVerificationSchema),
    defaultValues: {
      otp: "",
      sessionToken,
    }
  })

  // Countdown timer
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setCanResend(true)
    }
  }, [timeLeft])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Log presence of clientId for debugging and show confirmation banner
  useEffect(() => {
    try {
      if (userData?.clientId) {
        console.log('[OTP] Registration confirmed. Client ID:', userData.clientId)
      }
    } catch {}
  }, [userData?.clientId])

  const copyClientIdToClipboard = async () => {
    try {
      if (!userData?.clientId) return
      await navigator.clipboard.writeText(userData.clientId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.error('Failed to copy Client ID:', e)
    }
  }

  const onSubmit = (values: z.infer<typeof otpVerificationSchema>) => {
    setError("")
    setSuccess("")

    startTransition(() => {
      verifyOtp(values)
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
            // Pass control to parent component for next steps
            onVerificationSuccess(data)
          }
        })
        .catch((error) => {
          console.error("OTP verification error:", error)
          setError("Something went wrong! Please try again.")
        })
    })
  }

  const handleResendOtp = () => {
    setIsResending(true)
    setError("")
    setSuccess("")

    resendOtp(sessionToken)
      .then((data) => {
        if (data.error) {
          setError(data.error)
          toast({
            title: "Resend OTP failed",
            description: data.error,
            variant: "destructive",
          })
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
          setTimeLeft(300) // Reset timer
          setCanResend(false)
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to resend OTP"
        setError(message)
        toast({
          title: "Resend OTP failed",
          description: message,
          variant: "destructive",
        })
      })
      .finally(() => setIsResending(false))
  }

  const getPurposeMessage = () => {
    switch (userData?.purpose) {
      case "PHONE_VERIFICATION":
        return "Verify your mobile number to continue with account setup"
      case "MPIN_SETUP":
        return "Verify OTP to set up your secure mPin"
      case "LOGIN_VERIFICATION":
        return "Complete your login with OTP verification"
      case "PASSWORD_RESET":
        return "Verify OTP to reset your password"
      default:
        return "Enter the OTP sent to your registered contact"
    }
  }

  const maskPhoneNumber = (phone: string) => {
    if (!phone) return ""
    const cleanPhone = phone.replace(/\D/g, "")
    if (cleanPhone.length >= 10) {
      const lastFour = cleanPhone.slice(-4)
      const masked = cleanPhone.slice(0, -4).replace(/\d/g, "X")
      return `${masked}${lastFour}`
    }
    return phone
  }

  return (
    <CardWrapper
      headerLabel='OTP Verification'
      backButtonLabel="Back to login"
      backButtonHref="#"
      backButtonAction={onBack}
      showSocial={false}
    >
      {/* Account creation confirmation banner with Client ID */}
      {userData?.clientId && (
        <div className="mb-6 bg-orange-50 border border-orange-200 rounded-md p-4">
          <div className="flex items-start">
            <div className="mr-3 mt-1 text-primary">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-orange-700">Account created successfully</p>
              <p className="text-sm text-orange-800 mt-1">
                Your Client ID:
                <span className="font-mono font-bold ml-2 px-2 py-0.5 bg-white border border-orange-200 rounded">
                  {userData.clientId}
                </span>
              </p>
              <p className="text-xs text-orange-700 mt-2">
                Save this Client ID. You'll use it for login along with your password.
              </p>
              <button
                type="button"
                onClick={copyClientIdToClipboard}
                className="mt-3 inline-flex items-center text-xs text-primary hover:opacity-90"
              >
                <Copy className="mr-2 w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy Client ID'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center mb-6">
        <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
          <ShieldCheck className="text-primary w-8 h-8" />
        </div>
        <p className="text-gray-600 text-sm">
          {getPurposeMessage()}
        </p>
        <p className="text-gray-500 text-xs mt-2">
          OTP sent to {maskPhoneNumber(userData?.phone || "")} {userData?.emailEnqueued ? "and your email" : ""}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          <FormField
            control={form.control}
            name='otp'
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-700 font-medium text-center block">
                  Enter 6-digit OTP
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    disabled={isPending}
                    placeholder="123456"
                    type='text'
                    maxLength={6}
                    className="text-center text-2xl font-mono tracking-widest border-slate-300 focus:border-primary focus:ring focus:ring-primary/20 focus:ring-opacity-50 rounded-md shadow-sm"
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                      field.onChange(value)
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="text-center">
          <div className="flex items-center justify-center text-sm text-gray-500 mb-4">
              <Clock className="mr-2 w-4 h-4" />
              {timeLeft > 0 ? (
                <span>OTP expires in {formatTime(timeLeft)}</span>
              ) : (
                <span className="text-red-500">OTP expired</span>
              )}
            </div>

          {canResend && (
              <Button
                type="button"
                variant="ghost"
                disabled={isResending}
                onClick={handleResendOtp}
                className="text-primary hover:opacity-90 text-sm"
              >
                {isResending ? "Sending..." : "Resend OTP"}
              </Button>
            )}
          </div>

          <FormError message={error} />
          <FormSucess message={success} />

          <Button
            disabled={isPending || form.watch('otp').length !== 6}
            type='submit'
            className="w-full bg-primary hover:opacity-90 text-white font-bold py-3 px-4 rounded-md transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg"
          >
            {isPending ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Verifying...
              </div>
            ) : (
              "Verify OTP"
            )}
          </Button>

          <div className="text-xs text-gray-600 mt-3 text-center">
            Having trouble? Ensure network is stable. If OTP didn't arrive, tap Resend or check email if shown above.
          </div>

          <div className="text-center text-xs text-gray-500 mt-4">
            <p>🔒 Your data is protected with end-to-end encryption</p>
            <p className="mt-1">Don't share this OTP with anyone</p>
          </div>
        </form>
      </Form>
    </CardWrapper>
  )
}

export default OtpVerificationForm
