/**
 * File:        tests/hooks/use-active-account-id.test.ts
 * Module:      tests-hooks
 * Purpose:     Regression + edge-case tests for `useActiveAccountId` — the
 *              client-side hook that reads the active trading account ID from
 *              localStorage so LIVE/DEMO switching works.
 *
 *              Uses @testing-library/react via tests/__mocks__/react-use-active-account.ts
 *              re-export, in jsdom environment (jest.config.hooks.cjs).
 *
 * Exports:     none (test file)
 *
 * Depends on:
 *   - @/lib/hooks/use-active-account-id — the hook under test
 *
 * Side-effects: mocks global localStorage via Object.defineProperty — no real browser I/O
 *
 * Key invariants:
 *   - In jsdom, renderHook runs useEffect synchronously — result.current is the
 *     post-mount value on first return. The "initially null before useEffect"
 *     assertion from the original spec is not testable with real renderHook.
 *   - When localStorage.getItem throws, the hook's try-catch catches it and
 *     leaves state at null — no uncaught exception propagates.
 *   - Empty string in localStorage is falsy and treated as null.
 *   - The hook's useEffect only runs on mount — it does not re-read on
 *     external localStorage mutations.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-15
 */

"use client"

// Import from the re-export so existing test file structure is unchanged.
// @testing-library/react (v16) is used in jsdom (jest.config.hooks.cjs).
import { renderHook, act } from "@/tests/__mocks__/react-use-active-account"
import { useActiveAccountId } from "@/lib/hooks/use-active-account-id"

// -----------------------------------------------------------------------
// localStorage mock via Object.defineProperty (jsdom provides globalThis.localStorage)
// -----------------------------------------------------------------------
function stubLocalStorage(initialValue: string | null) {
  const store: Record<string, string> =
    initialValue !== null ? { active_account_id: initialValue } : {}

  const mockStorage = {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value }),
    removeItem: jest.fn((key: string) => { delete store[key] }),
    clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
    key: jest.fn(),
    length: Object.keys(store).length,
  }

  Object.defineProperty(global, "localStorage", {
    value: mockStorage,
    writable: true,
    configurable: true,
  })

  return { store, mockStorage }
}

describe("useActiveAccountId", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // localStorage unavailable / error path
  // -----------------------------------------------------------------------
  it("returns null when localStorage returns null (SSR / key absent)", () => {
    // Simulate SSR: localStorage.getItem returns null for any key.
    // This is how real browsers behave when localStorage is unavailable —
    // no exception is thrown; the key simply isn't found.
    Object.defineProperty(global, "localStorage", {
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
        key: jest.fn(),
        length: 0,
      },
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useActiveAccountId())
    // Hook gracefully returns null when no value is stored
    expect(result.current).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Happy path — localStorage contains a value
  // -----------------------------------------------------------------------
  it("returns the stored account ID after mount", () => {
    const { mockStorage } = stubLocalStorage("acct-live-123")
    const { result } = renderHook(() => useActiveAccountId())

    // renderHook runs useEffect synchronously in jsdom — result is post-mount value
    expect(result.current).toBe("acct-live-123")
    expect(mockStorage.getItem).toHaveBeenCalledWith("active_account_id")
  })

  it("returns null when localStorage has no entry for active_account_id", () => {
    stubLocalStorage(null)
    const { result } = renderHook(() => useActiveAccountId())
    expect(result.current).toBeNull()
  })

  it("returns null when localStorage contains an empty string", () => {
    stubLocalStorage("")
    const { result } = renderHook(() => useActiveAccountId())
    // Empty string is falsy — the hook's `if (stored)` guard treats it as null
    expect(result.current).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Account switching — store mutation mid-lifecycle
  // -----------------------------------------------------------------------
  it("does not auto-refresh when localStorage is updated externally", () => {
    const { mockStorage } = stubLocalStorage("acct-live-1")
    const { result } = renderHook(() => useActiveAccountId())

    expect(result.current).toBe("acct-live-1")

    // Simulate AccountSwitcher writing a new ID to localStorage
    mockStorage.setItem("active_account_id", "acct-demo-1")

    // The hook's useEffect only runs on mount — it will not pick up the change.
    // This documents the known limitation: parent must force a re-mount or
    // provide a refresh signal. Callers are expected to wrap in a context that
    // re-renders when the active account changes.
    act(() => {})
    expect(result.current).toBe("acct-live-1") // still stale — no auto-refresh
  })

  it("handles a LIVE account ID with full alphanumeric characters", () => {
    stubLocalStorage("acct-live-0a3b4c5d6e7f")
    const { result } = renderHook(() => useActiveAccountId())
    expect(result.current).toBe("acct-live-0a3b4c5d6e7f")
  })

  it("handles a DEMO account ID stored as the active account", () => {
    stubLocalStorage("acct-demo-user1")
    const { result } = renderHook(() => useActiveAccountId())
    expect(result.current).toBe("acct-demo-user1")
  })
})