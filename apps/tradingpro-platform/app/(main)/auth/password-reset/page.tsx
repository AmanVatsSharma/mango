"use client"

/**
 * @file password-reset/page.tsx
 * @module app/(main)/auth
 * @description Password reset page that consumes tokenized links and presents desktop-aware loading shells.
 * @author StockTrade
 * @created 2026-02-16
 */

import React, { useMemo, useTransition, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
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
import { NewPasswordSchema } from "@/schemas"
import { newPassword } from "@/actions/auth.actions"
import { getAuthRoute } from "@/lib/branding-routes"

const PasswordResetContent = () => {
  const router = useRouter()
  const params = useSearchParams()
  const token = useMemo(() => params?.get("token") ?? null, [params])

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>("")
  const [success, setSuccess] = useState<string | undefined>("")

  const form = useForm<z.infer<typeof NewPasswordSchema>>({
    resolver: zodResolver(NewPasswordSchema),
    defaultValues: { password: "" },
  })

  const onSubmit = (values: z.infer<typeof NewPasswordSchema>) => {
    console.log("[PasswordReset] Submit with token:", token)
    setError("")
    setSuccess("")

    if (!token) {
      setError("Missing token in URL. Please use the link from your email.")
      return
    }

    startTransition(() => {
      newPassword(values, token)
        .then((res) => {
          console.log("[PasswordReset] newPassword response:", res)
          if (res?.error) {
            setError(res.error)
          }
          if (res?.success) {
            setSuccess(res.success)
          }
        })
        .catch((e) => {
          console.error("[PasswordReset] newPassword error:", e)
          setError("Something went wrong. Please try again.")
        })
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="hidden lg:flex min-h-[520px] rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 p-8 text-white shadow-2xl">
          <div className="flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-3xl font-bold leading-tight">Set a fresh password and continue securely.</h2>
              <p className="text-sm text-emerald-100/90">
                Your new password takes effect immediately and keeps your account protected across devices.
              </p>
            </div>
            <div className="space-y-2 text-sm text-emerald-100/90">
              <p>• One-time reset link with expiry protection</p>
              <p>• Password update secured with server-side validation</p>
              <p>• Seamless return to login after update</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md md:max-w-lg xl:max-w-xl mx-auto lg:mx-0 lg:justify-self-end">
          <CardWrapper
            headerLabel="Reset your password"
            backButtonLabel="Back to login"
            backButtonHref={getAuthRoute("login")}
            showSocial={false}
          >
            {!token ? (
              <div className="space-y-4">
                <FormError message={"Missing or invalid reset token."} />
                <p className="text-sm text-gray-600">Please use the password reset link from your email.</p>
                <div className="text-center">
                  <Link href={getAuthRoute("forgotPassword")} className="text-emerald-600 hover:text-emerald-700 font-medium">
                    Request a new reset link
                  </Link>
                </div>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 font-medium">New password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={isPending}
                          placeholder="Enter new password"
                          type="password"
                          className="border-slate-300 focus:border-emerald-600 focus:ring focus:ring-emerald-200 focus:ring-opacity-50 rounded-md shadow-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormError message={error} />
                <FormSucess message={success} />

                <Button
                  disabled={isPending}
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-md transition duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg"
                >
                  {isPending ? "Updating..." : "Update password"}
                </Button>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
                  <p className="font-semibold mb-1">Important:</p>
                  <ul className="space-y-1">
                    <li>• Your reset link is valid for 1 hour only</li>
                    <li>• Password must be 8-32 characters long</li>
                    <li>• If expired, request a new reset link</li>
                  </ul>
                </div>
                </form>
              </Form>
            )}
          </CardWrapper>
        </div>
      </div>
    </div>
  )
}

export default function PasswordResetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-100 p-4">
          <div className="rounded-2xl border border-emerald-100 bg-white/85 px-6 py-5 text-sm text-emerald-900 shadow-sm backdrop-blur-md">
            Loading password reset workspace…
          </div>
        </div>
      }
    >
      <PasswordResetContent />
    </Suspense>
  )
}


