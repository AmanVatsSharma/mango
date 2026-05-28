"use client"

/**
 * @file profile-section.tsx
 * @module components/console/sections
 * @description Profile workspace with avatar upload (S3), identity details, and security entry points.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-06
 */

import { useState, useRef } from "react"
import { motion } from "framer-motion"
import { Copy, Check, Shield, User, Mail, Phone, Calendar, ImageUp, Trash2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { ChangeMPINDialog } from "../dialogs/change-mpin-dialog"
import { useSession } from "next-auth/react"
import { useConsoleData } from "@/lib/hooks/use-console-data"
import { uploadAvatarFile } from "@/components/console/profile/upload-avatar"

function initialsFromName(name: string): string {
  if (!name || name === "-") return "U"
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function ProfileSection() {
  const [copied, setCopied] = useState(false)
  const [showMPINDialog, setShowMPINDialog] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const { data: session, update: updateSession } = useSession()
  const userId = (session?.user as { id?: string })?.id as string | undefined
  const { consoleData, isLoading, error, updateUserAvatar, clearUserAvatar } = useConsoleData(userId)
  
  const sUser = (session?.user || {}) as { clientId?: string; image?: string | null; name?: string | null }
  const clientId = consoleData?.user?.clientId ?? sUser?.clientId ?? "-"
  const avatarUrl = consoleData?.user?.image ?? sUser?.image ?? undefined
  const userProfile = {
    name: consoleData?.user?.name ?? sUser?.name ?? "-",
    email: consoleData?.user?.email ?? sUser?.email ?? "-",
    mobile: consoleData?.user?.phone ?? sUser?.phone ?? "-",
    joinDate: consoleData?.user?.createdAt ? new Date(consoleData.user.createdAt).toLocaleDateString() : "-",
    kycStatus: consoleData?.user?.kycStatus ?? "-",
    accountType: consoleData?.user?.role ?? (sUser?.role as string | undefined) ?? "USER",
    tradingStatus: consoleData?.tradingAccount ? "Active" : "Inactive",
  }
  
  const copyClientId = async () => {
    try {
      await navigator.clipboard.writeText(clientId)
      setCopied(true)
      toast({
        title: "Copied!",
        description: "Client ID copied to clipboard",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      })
    }
  }

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setAvatarBusy(true)
    try {
      const { url } = await uploadAvatarFile(file)
      const res = await updateUserAvatar(url)
      if (!res.success) {
        toast({
          title: "Could not save avatar",
          description: res.message,
          variant: "destructive",
        })
        return
      }
      await updateSession()
      toast({ title: "Avatar updated" })
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      })
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleRemoveAvatar = async () => {
    setAvatarBusy(true)
    try {
      const res = await clearUserAvatar()
      if (!res.success) {
        toast({
          title: "Could not remove avatar",
          description: res.message,
          variant: "destructive",
        })
        return
      }
      await updateSession()
      toast({ title: "Avatar removed" })
    } finally {
      setAvatarBusy(false)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading profile data...
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-xl font-semibold text-destructive">Error loading profile</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 lg:space-y-8"
    >
      {/* Header - Mobile Optimized */}
      <div className="space-y-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Profile</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage your account information and security settings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Profile Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Personal Information
            </CardTitle>
            <CardDescription>Your account details and contact information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/jpg,image/webp"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border bg-muted/30">
              <Avatar className="h-20 w-20 shrink-0 border border-border">
                <AvatarImage src={avatarUrl || undefined} alt={userProfile.name} />
                <AvatarFallback className="text-lg font-semibold">{initialsFromName(userProfile.name)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={avatarBusy}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <ImageUp className="w-4 h-4" />
                  {avatarUrl ? "Change photo" : "Add photo"}
                </Button>
                {avatarUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive"
                    disabled={avatarBusy}
                    onClick={handleRemoveAvatar}
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Client ID Section */}
            <div className="p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Client ID</label>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg font-mono font-semibold text-foreground">{clientId}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyClientId}
                      className="h-8 w-8 p-0 hover:bg-primary/10"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  {userProfile.accountType}
                </Badge>
              </div>
            </div>

            {/* User Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground">{userProfile.name}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground">{userProfile.email}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Mobile Number</label>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground">{userProfile.mobile}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground">{userProfile.joinDate}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Status Badges */}
            <div className="flex flex-wrap gap-3">
              <Badge
                variant="outline"
                className="border-green-200 text-green-700 bg-green-50 dark:border-green-800 dark:text-green-300 dark:bg-green-950"
              >
                KYC: {userProfile.kycStatus}
              </Badge>
              <Badge
                variant="outline"
                className="border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-950"
              >
                Trading: {userProfile.tradingStatus}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Security
            </CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Button onClick={() => setShowMPINDialog(true)} variant="outline" className="w-full justify-start gap-2">
                <Shield className="w-4 h-4" />
                Change MPIN
              </Button>

              <Button variant="outline" className="w-full justify-start gap-2 bg-transparent">
                <Shield className="w-4 h-4" />
                Two-Factor Auth
              </Button>

              <Button variant="outline" className="w-full justify-start gap-2 bg-transparent">
                <Shield className="w-4 h-4" />
                Login History
              </Button>
            </div>

            <Separator />

            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">Security Tips:</p>
              <ul className="space-y-1 text-xs">
                <li>• Change your MPIN regularly</li>
                <li>• Enable two-factor authentication</li>
                <li>• Never share your credentials</li>
                <li>• Log out from shared devices</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Change MPIN Dialog */}
      <ChangeMPINDialog open={showMPINDialog} onOpenChange={setShowMPINDialog} />
    </motion.div>
  )
}
