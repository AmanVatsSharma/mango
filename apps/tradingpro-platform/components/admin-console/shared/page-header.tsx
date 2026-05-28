/**
 * @file page-header.tsx
 * @module admin-console/shared
 * @description Enhanced page header component combining best features from all admin console components
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * Enhanced Page Header Component
 * 
 * Combines header patterns from all admin console components:
 * - Consistent layout and spacing
 * - Responsive design
 * - Icon support
 * - Action buttons area
 * - Motion animations
 */
export function PageHeader({ title, description, icon, actions, className = "" }: PageHeaderProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.3 }}
      className={className}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-primary mb-1 sm:mb-2 flex items-center gap-2 break-words">
            {icon && <span className="flex-shrink-0">{icon}</span>}
            <span>{title}</span>
          </h1>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground break-words">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center space-x-2 flex-shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </motion.div>
  )
}
