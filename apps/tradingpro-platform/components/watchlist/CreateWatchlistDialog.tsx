/**
 * @file CreateWatchlistDialog.tsx
 * @description Dialog for creating new watchlists with color picker and advanced options
 */

"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Star, Palette, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { BRAND_THEME } from "@/Branding"

interface CreateWatchlistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: {
    name: string
    description?: string
    color?: string
    isDefault?: boolean
  }) => Promise<void>
}

const PRESET_COLORS = BRAND_THEME.watchlist.presetColors

export function CreateWatchlistDialog({
  open,
  onOpenChange,
  onCreate
}: CreateWatchlistDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedColor, setSelectedColor] = useState(BRAND_THEME.watchlist.defaultColor)
  const [isDefault, setIsDefault] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for your watchlist.",
        variant: "destructive"
      })
      return
    }

    setIsCreating(true)
    
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        color: selectedColor,
        isDefault
      })
      
      // Reset form
      setName("")
      setDescription("")
      setSelectedColor(BRAND_THEME.watchlist.defaultColor)
      setIsDefault(false)
    } catch (error) {
      // Error is handled by the parent
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    if (!isCreating) {
      onOpenChange(false)
      // Reset form on close
      setName("")
      setDescription("")
      setSelectedColor(BRAND_THEME.watchlist.defaultColor)
      setIsDefault(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-white/95 backdrop-blur-md border-0 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-brand-primary" />
            Create New Watchlist
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Tech Stocks, F&O, etc."
              maxLength={50}
              disabled={isCreating}
              className="w-full"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for your watchlist"
              maxLength={200}
              disabled={isCreating}
              className="resize-none"
              rows={3}
            />
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Color Theme
            </Label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map((color) => (
                <motion.button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`
                    w-8 h-8 rounded-full border-2 transition-all
                    ${selectedColor === color 
                      ? 'border-gray-900 dark:border-white scale-110' 
                      : 'border-gray-300 dark:border-gray-600 hover:scale-105'
                    }
                  `}
                  style={{ backgroundColor: color }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={isCreating}
                />
              ))}
            </div>
          </div>

          {/* Default Watchlist */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="isDefault">Set as Default</Label>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                This watchlist will be selected by default
              </p>
            </div>
            <Switch
              id="isDefault"
              checked={isDefault}
              onCheckedChange={setIsDefault}
              disabled={isCreating}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isCreating}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isCreating || !name.trim()}
              className="flex-1"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Star className="h-4 w-4 mr-2" />
                  Create Watchlist
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
