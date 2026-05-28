/**
 * @file EditWatchlistDialog.tsx
 * @description Dialog for editing watchlists with advanced options
 */

"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Star, Palette, Trash2, Loader2, AlertTriangle } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import type { WatchlistData } from "@/lib/hooks/use-prisma-watchlist"
import { BRAND_THEME } from "@/Branding"

interface EditWatchlistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  watchlist: WatchlistData | null
  onUpdate: (data: {
    name?: string
    description?: string
    color?: string
    isDefault?: boolean
  }) => Promise<void>
  onDelete: (watchlistId: string) => Promise<void>
}

const PRESET_COLORS = BRAND_THEME.watchlist.presetColors

export function EditWatchlistDialog({
  open,
  onOpenChange,
  watchlist,
  onUpdate,
  onDelete
}: EditWatchlistDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedColor, setSelectedColor] = useState(BRAND_THEME.watchlist.defaultColor)
  const [isDefault, setIsDefault] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Initialize form when watchlist changes
  useEffect(() => {
    if (watchlist) {
      setName(watchlist.name)
      setDescription(watchlist.description || "")
      setSelectedColor(watchlist.color)
      setIsDefault(watchlist.isDefault)
      setIsPrivate(watchlist.isPrivate)
    }
  }, [watchlist])

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

    if (!watchlist) return

    setIsUpdating(true)
    
    try {
      await onUpdate({
        name: name.trim(),
        description: description.trim() || undefined,
        color: selectedColor,
        isDefault
      })
      
      onOpenChange(false)
    } catch (error) {
      // Error is handled by the parent
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!watchlist) return

    setIsDeleting(true)
    
    try {
      await onDelete(watchlist.id)
      setShowDeleteConfirm(false)
      onOpenChange(false)
    } catch (error) {
      // Error is handled by the parent
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    if (!isUpdating && !isDeleting) {
      onOpenChange(false)
      setShowDeleteConfirm(false)
    }
  }

  if (!watchlist) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-white/95 backdrop-blur-md border-0 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-brand-primary" />
            Edit Watchlist
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
              disabled={isUpdating || isDeleting}
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
              disabled={isUpdating || isDeleting}
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
                  disabled={isUpdating || isDeleting}
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
              disabled={isUpdating || isDeleting}
            />
          </div>

          {/* Stats */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Items:</span>
                <span className="ml-2 font-medium">{watchlist.items.length}</span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Created:</span>
                <span className="ml-2 font-medium">
                  {new Date(watchlist.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-4">
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isUpdating || isDeleting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isUpdating || isDeleting || !name.trim()}
                className="flex-1"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Star className="h-4 w-4 mr-2" />
                    Update Watchlist
                  </>
                )}
              </Button>
            </div>

            {/* Delete Button */}
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isUpdating || isDeleting}
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Watchlist
            </Button>
          </div>
        </form>

        {/* Delete Confirmation */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-sm bg-white/95 backdrop-blur-md border-0 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Delete Watchlist
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                Are you sure you want to delete "<strong>{watchlist.name}</strong>"? 
                This will remove all {watchlist.items.length} stocks from this watchlist.
                This action cannot be undone.
              </p>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
