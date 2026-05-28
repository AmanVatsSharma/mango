/**
 * @file SessionSecurityStepUpClient.tsx
 * @module auth
 * @description Client form to complete Session Security STEP_UP (MPIN) after clustered-network login.
 * @author StockTrade
 * @created 2026-03-28
 */

"use client"

import { useEffect, useState } from "react"
import { signIn, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { getAppRoute, getAuthRoute } from "@/lib/branding-routes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Shield } from "lucide-react"

export function SessionSecurityStepUpClient() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const [mpin, setMpin] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = Boolean((session?.user as { sessionSecurityStepUpPending?: boolean } | undefined)?.sessionSecurityStepUpPending)
  const challengeId = (session?.user as { sessionSecurityStepUpChallengeId?: string } | undefined)?.sessionSecurityStepUpChallengeId
  const email = session?.user?.email ?? ""

  useEffect(() => {
    if (status === "loading") return
    if (!session?.user) {
      router.replace(getAuthRoute("login"))
      return
    }
    if (!pending) {
      router.replace(getAppRoute("dashboard"))
    }
  }, [session, status, pending, router])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email || !challengeId) {
      setError("Session expired. Please sign in again.")
      return
    }
    setBusy(true)
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        stepUpChallengeId: challengeId,
        sessionSecurityMpin: mpin,
      })
      if (res?.error) {
        setError("Verification failed. Check your mPin and try again.")
        setBusy(false)
        return
      }
      await update()
      router.replace(getAppRoute("dashboard"))
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  if (status === "loading" || !pending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-md border-border/80 shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" aria-hidden />
            <CardTitle>Verify it&apos;s you</CardTitle>
          </div>
          <CardDescription>
            We noticed this sign-in from a shared or higher-risk network. Enter your mPin to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ss-mpin">mPin</Label>
              <Input
                id="ss-mpin"
                inputMode="numeric"
                autoComplete="one-time-code"
                name="session-security-m-pin"
                maxLength={6}
                value={mpin}
                onChange={(ev) => setMpin(ev.target.value.replace(/\D/g, ""))}
                placeholder="4–6 digits"
                disabled={busy}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || mpin.length < 4}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
