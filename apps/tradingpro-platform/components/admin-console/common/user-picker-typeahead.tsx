/**
 * File:        components/admin-console/common/user-picker-typeahead.tsx
 * Module:      Admin Console · Common Components
 * Purpose:     Debounced typeahead input that searches users by name/email/clientId
 *              and returns the selected user's ID. Replaces raw UUID paste inputs.
 *
 * Exports:
 *   - UserPickerTypeahead(props: UserPickerTypeaheadProps) — input with dropdown list of
 *     matched users; calls onChange with the selected userId and user details.
 *   - UserPickerTypeaheadProps — prop shape for the component
 *
 * Depends on:
 *   - /api/admin/users/search  — GET ?q=<query> endpoint (min 2 chars, max 10 results)
 *
 * Side-effects:
 *   - HTTP GET to /api/admin/users/search with credentials: "include"
 *
 * Key invariants:
 *   - Debounce delay is 300ms; requests in-flight when a new keystroke arrives are aborted
 *   - Typing < 2 chars clears results; clearing the input calls onChange("", undefined)
 *   - Dropdown closes on selection, blur, or Escape key
 *   - When value is a UUID and no display name is known, the raw UUID is shown
 *   - disabled prop mirrors the disabled state of the underlying input
 *
 * Read order:
 *   1. UserPickerTypeaheadProps — data shape
 *   2. useTypeahead — search logic (debounce + abort)
 *   3. UserPickerTypeahead — render
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

export type UserSearchResult = {
  id: string
  name: string | null
  email: string | null
  clientId: string | null
  phone?: string | null
}

export type UserPickerTypeaheadProps = {
  /** current userId (UUID or empty string) */
  value: string
  /** called when a user is selected or the field is cleared */
  onChange: (
    userId: string,
    user?: { name: string; email: string | null; clientId: string | null },
  ) => void
  placeholder?: string
  disabled?: boolean
}

const DEBOUNCE_MS = 300
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── search hook ─────────────────────────────────────────────────────────────

type SearchState = {
  results: UserSearchResult[]
  loading: boolean
  error: string | null
}

function useTypeahead(query: string): SearchState {
  const [state, setState] = useState<SearchState>({ results: [], loading: false, error: null })
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (query.trim().length < 2) {
      setState({ results: [], loading: false, error: null })
      return
    }

    setState((s) => ({ ...s, loading: true, error: null }))

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query.trim())}`, {
          credentials: "include",
          signal: controller.signal,
        })
        if (!res.ok) throw new Error("Search failed")
        const data = (await res.json()) as { users: UserSearchResult[] }
        setState({ results: data.users ?? [], loading: false, error: null })
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return
        setState({ results: [], loading: false, error: "Search failed" })
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [query])

  return state
}

// ─── component ───────────────────────────────────────────────────────────────

export function UserPickerTypeahead({
  value,
  onChange,
  placeholder = "Search by name, email, or client ID…",
  disabled = false,
}: UserPickerTypeaheadProps) {
  // inputText is what the user sees; may differ from the UUID value
  const [inputText, setInputText] = useState<string>(() =>
    value && !UUID_RE.test(value) ? value : value ?? "",
  )
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const { results, loading } = useTypeahead(open ? inputText : "")

  const containerRef = useRef<HTMLDivElement>(null)

  // When value is cleared externally, reset input
  useEffect(() => {
    if (!value) {
      setInputText("")
      setSelectedName(null)
    }
  }, [value])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value
      setInputText(text)
      setSelectedName(null)
      setOpen(text.length >= 2)
      if (!text) onChange("", undefined)
    },
    [onChange],
  )

  const handleSelect = useCallback(
    (user: UserSearchResult) => {
      const displayName = user.name ?? user.email ?? user.id
      setInputText(displayName)
      setSelectedName(displayName)
      setOpen(false)
      onChange(user.id, {
        name: user.name ?? user.email ?? user.id,
        email: user.email,
        clientId: user.clientId,
      })
    },
    [onChange],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false)
  }

  const displayValue = selectedName ?? (value && UUID_RE.test(value) && !inputText ? value : inputText)

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => { if (inputText.length >= 2) setOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          </span>
        )}
      </div>

      {open && (results.length > 0 || loading) && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-60 overflow-y-auto text-sm">
          {loading && results.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Searching…
            </li>
          )}
          {results.map((user) => (
            <li
              key={user.id}
              className="flex flex-col gap-0.5 px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground select-none"
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(user)
              }}
            >
              <span className="font-medium text-foreground">{user.name ?? user.email ?? user.id}</span>
              <span className="text-xs text-muted-foreground font-mono">
                {user.email ?? "—"}
                {user.clientId ? ` · ${user.clientId}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && results.length === 0 && inputText.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg px-3 py-2 text-sm text-muted-foreground">
          No users found.
        </div>
      )}
    </div>
  )
}
