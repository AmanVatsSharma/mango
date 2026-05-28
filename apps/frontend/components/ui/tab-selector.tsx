"use client"

import React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface TabOption {
  id: string
  label: string
  disabled?: boolean
}

interface TabSelectorProps {
  options: TabOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  themeColor?: string // e.g., "bg-emerald-500" or "bg-rose-500"
}

export function TabSelector({
  options,
  value,
  onChange,
  className,
  themeColor = "bg-primary"
}: TabSelectorProps) {
  return (
    <div className={cn("relative flex p-1 bg-gray-100 dark:bg-gray-800/50 rounded-xl", className)}>
      {options.map((option) => {
        const isActive = value === option.id
        return (
          <button
            key={option.id}
            onClick={() => !option.disabled && onChange(option.id)}
            disabled={option.disabled}
            className={cn(
              "relative flex-1 py-2 text-xs sm:text-sm font-medium transition-colors z-10",
              isActive 
                ? "text-white" 
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
              option.disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className={cn("absolute inset-0 rounded-lg shadow-sm", themeColor)}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
