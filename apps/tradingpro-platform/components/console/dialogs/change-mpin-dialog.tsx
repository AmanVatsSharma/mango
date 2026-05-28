"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Eye, EyeOff, Shield } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

interface ChangeMPINDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangeMPINDialog({ open, onOpenChange }: ChangeMPINDialogProps) {
  const [currentMPIN, setCurrentMPIN] = useState("")
  const [newMPIN, setNewMPIN] = useState("")
  const [confirmMPIN, setConfirmMPIN] = useState("")
  const [showCurrentMPIN, setShowCurrentMPIN] = useState(false)
  const [showNewMPIN, setShowNewMPIN] = useState(false)
  const [showConfirmMPIN, setShowConfirmMPIN] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newMPIN !== confirmMPIN) {
      toast({
        title: "Error",
        description: "New MPIN and confirmation don't match",
        variant: "destructive",
      })
      return
    }

    if (newMPIN.length !== 4 || !/^\d+$/.test(newMPIN)) {
      toast({
        title: "Error",
        description: "MPIN must be exactly 4 digits",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      toast({
        title: "Success",
        description: "MPIN changed successfully",
      })
      onOpenChange(false)
      setCurrentMPIN("")
      setNewMPIN("")
      setConfirmMPIN("")
    }, 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md lg:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Change MPIN
          </DialogTitle>
          <DialogDescription>
            Enter your current MPIN and set a new 4-digit MPIN for your account security.
          </DialogDescription>
        </DialogHeader>

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {/* Current MPIN */}
          <div className="space-y-2">
            <Label htmlFor="current-mpin">Current MPIN</Label>
            <div className="relative">
              <Input
                id="current-mpin"
                type={showCurrentMPIN ? "text" : "password"}
                value={currentMPIN}
                onChange={(e) => setCurrentMPIN(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Enter current MPIN"
                maxLength={4}
                className="pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowCurrentMPIN(!showCurrentMPIN)}
              >
                {showCurrentMPIN ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {/* New MPIN */}
          <div className="space-y-2">
            <Label htmlFor="new-mpin">New MPIN</Label>
            <div className="relative">
              <Input
                id="new-mpin"
                type={showNewMPIN ? "text" : "password"}
                value={newMPIN}
                onChange={(e) => setNewMPIN(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Enter new 4-digit MPIN"
                maxLength={4}
                className="pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowNewMPIN(!showNewMPIN)}
              >
                {showNewMPIN ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {/* Confirm MPIN */}
          <div className="space-y-2">
            <Label htmlFor="confirm-mpin">Confirm New MPIN</Label>
            <div className="relative">
              <Input
                id="confirm-mpin"
                type={showConfirmMPIN ? "text" : "password"}
                value={confirmMPIN}
                onChange={(e) => setConfirmMPIN(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Confirm new MPIN"
                maxLength={4}
                className="pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmMPIN(!showConfirmMPIN)}
              >
                {showConfirmMPIN ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Changing..." : "Change MPIN"}
            </Button>
          </DialogFooter>
        </motion.form>
      </DialogContent>
    </Dialog>
  )
}
