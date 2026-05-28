"use client"
import React, { useTransition, useState } from "react"
import CardWrapper from "@/components/auth/CardWrapper"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import FormError from "@/components/form-error"
import FormSucess from "@/components/form-sucess"
import Link from "next/link"
import { resetPassword } from "@/actions/auth.actions"
import { toast } from "@/hooks/use-toast"
import { getAuthRoute } from "@/lib/branding-routes"

// Local schema for forgot password identifier input (email / mobile / clientId)
const ForgotPasswordSchema = z.object({
  identifier: z
    .string()
    .min(1, "Identifier is required"),
})

const ForgotPasswordPage = () => {
  // Transition for non-blocking UI updates
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>("")
  const [success, setSuccess] = useState<string | undefined>("")

  // Initialize form with zod validation
  const form = useForm<z.infer<typeof ForgotPasswordSchema>>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { identifier: "" },
  })

  // Handle form submission
  const onSubmit = (values: z.infer<typeof ForgotPasswordSchema>) => {
    console.log("[ForgotPassword] Submit initiated with:", values)
    setError("")
    setSuccess("")
    startTransition(() => {
      resetPassword(values)
        .then((res) => {
          console.log("[ForgotPassword] resetPassword response:", res)
          if (res?.error) {
            setError(res.error)
          }
          if (res?.success) {
            setSuccess(res.success)
          }
          if (res?.warning) {
            toast({
              title: "OTP email delivery issue",
              description: res.warning,
              variant: "destructive",
            })
          }
        })
        .catch((e) => {
          console.error("[ForgotPassword] resetPassword error:", e)
          setError("Something went wrong. Please try again.")
        })
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <CardWrapper
          headerLabel="Forgot your password?"
          backButtonLabel="Back to login"
          backButtonHref={getAuthRoute("login")}
          showSocial={false}
        >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Email input */}
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700 font-medium">Email / Mobile / Client ID</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isPending}
                        placeholder="you@example.com or 98XXXXXXXX or AB1234"
                        type="text"
                      className="border-slate-300 focus:border-primary focus:ring focus:ring-primary/20 focus:ring-opacity-50 rounded-md shadow-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Feedback messages */}
              <FormError message={error} />
              <FormSucess message={success} />

              {/* Submit */}
              <Button
                disabled={isPending}
                type="submit"
                className="w-full bg-primary hover:opacity-90 text-white font-bold py-3 px-4 rounded-md transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg"
              >
                {isPending ? "Sending reset instructions..." : "Send reset instructions"}
              </Button>

              {/* Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-gray-600">
                <p className="font-semibold text-blue-800 mb-2">📧 How it works:</p>
                <ul className="space-y-1 text-gray-700">
                  <li>• Reset link will be sent to your email (valid for 1 hour)</li>
                  <li>• OTP will be sent to your registered mobile (valid for 5 minutes)</li>
                  <li>• You can use either method to reset your password</li>
                </ul>
              </div>

              <div className="text-center text-sm text-gray-600 mt-2">
                <Link href={getAuthRoute("login")} className="text-primary hover:opacity-90 font-medium">
                  Back to login
                </Link>
              </div>
            </form>
          </Form>
        </CardWrapper>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
