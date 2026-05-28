/**
 * File:        components/form-error.tsx
 * Module:      Forms · Inline error
 * Purpose:     Tiny presentational alert shown next to form fields when validation fails.
 *
 * Exports:
 *   - default FormError({ message? }) — renders nothing when message is empty
 *
 * Depends on:
 *   - lucide-react — replaces the prior react-icons dep (Wave 1 perf cleanup)
 *
 * Side-effects: none
 *
 * Key invariants: none
 *
 * Read order:
 *   1. FormError — sole export
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface FormErrorProps {
    message?: string,
}

const FormError = ({
    message,
}: FormErrorProps) => {

    if (!message) return null;

    return (
        <div role="alert" aria-live="polite" className='bg-red-500/10 border border-red-200 p-3 rounded-md flex items-center gap-x-2 text-sm text-red-700'>
            <AlertTriangle className="h-4 w-4" />
            <p>{message}</p>
        </div>
    )
}

export default FormError
