"use client"

/**
 * @file number-stepper.tsx
 * @module components-ui
 * @description Accessible, mobile-first number stepper. Uses rawText + type="text" + Pointer Events
 *   (no separate mouse/touch handlers) to prevent ghost-click double-fire and enable direct backspace
 *   editing. formatValue is applied as display-only; user always edits the plain number.
 */

import React, { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  normalizeNumberStepperInputValue,
  normalizeNumberStepperRoundedValue,
} from "@/components/ui/number-stepper-utils"

interface NumberStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  disabled?: boolean
  className?: string
  /** Optional display formatter (e.g. price prefix). Applied when not focused; raw number shown while editing. */
  formatValue?: (val: number) => string
}

export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 999999,
  step = 1,
  label,
  disabled = false,
  className,
  formatValue,
}: NumberStepperProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [rawText, setRawText] = useState(String(value))
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep rawText in sync when the parent updates value (e.g., from hold-repeat taps),
  // but do NOT disrupt the user while they are actively typing.
  useEffect(() => {
    if (!isFocused) {
      setRawText(String(value))
    }
  }, [value, isFocused])

  const clampAndRound = (n: number) =>
    normalizeNumberStepperRoundedValue(Math.min(max, Math.max(min, n)))

  const handleIncrement = () => {
    if (disabled || value >= max) return
    onChange(clampAndRound(value + step))
  }

  const handleDecrement = () => {
    if (disabled || value <= min) return
    onChange(clampAndRound(value - step))
  }

  const startAutoChange = (action: () => void) => {
    action()
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(action, 120)
    }, 500)
  }

  const stopAutoChange = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  // ── Input handlers ──────────────────────────────────────────────────────────

  const handleFocus = () => {
    setIsFocused(true)
    // Strip any display prefix (e.g. "₹") so user edits the plain number
    setRawText(String(value))
    // Select-all after the re-render so the user can immediately overtype
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setRawText(text)
    // Live update: if the typed string is already a valid number, push it upstream
    const parsed = normalizeNumberStepperInputValue(text)
    if (parsed !== null) {
      onChange(clampAndRound(parsed))
    }
  }

  const handleBlur = () => {
    setIsFocused(false)
    const parsed = normalizeNumberStepperInputValue(rawText)
    if (parsed !== null) {
      // Commit the final parsed value (already clamped)
      onChange(clampAndRound(parsed))
    } else {
      // Empty / invalid — snap back to the last confirmed value
      setRawText(String(value))
    }
  }

  // When focused: show raw text (no prefix); when blurred: show formatted display value
  const displayValue = isFocused ? rawText : (formatValue ? formatValue(value) : String(value))

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 ml-1">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex items-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border transition-all duration-200",
          isFocused
            ? "border-primary ring-2 ring-primary/10 bg-white dark:bg-gray-800"
            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        {/* ── Decrement ── */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onPointerDown={(e) => {
            // preventDefault stops ghost-click on mobile (touch → pointer → click sequence)
            // and prevents the button from stealing focus from the input
            e.preventDefault()
            startAutoChange(handleDecrement)
          }}
          onPointerUp={stopAutoChange}
          onPointerLeave={stopAutoChange}
          onPointerCancel={stopAutoChange}
          style={{ touchAction: "manipulation" }}
          className="flex-shrink-0 p-3 text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors select-none"
          disabled={disabled || value <= min}
          aria-label="Decrease value"
        >
          <Minus className="h-4 w-4" />
        </motion.button>

        {/* ── Editable value field ── */}
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleTextChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          aria-label={label ?? "value"}
          style={{ touchAction: "manipulation" }}
          className="flex-1 min-w-0 text-center bg-transparent border-none outline-none font-mono font-semibold text-lg text-gray-900 dark:text-gray-100 py-2.5"
        />

        {/* ── Increment ── */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onPointerDown={(e) => {
            e.preventDefault()
            startAutoChange(handleIncrement)
          }}
          onPointerUp={stopAutoChange}
          onPointerLeave={stopAutoChange}
          onPointerCancel={stopAutoChange}
          style={{ touchAction: "manipulation" }}
          className="flex-shrink-0 p-3 text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors select-none"
          disabled={disabled || value >= max}
          aria-label="Increase value"
        >
          <Plus className="h-4 w-4" />
        </motion.button>
      </div>
    </div>
  )
}
