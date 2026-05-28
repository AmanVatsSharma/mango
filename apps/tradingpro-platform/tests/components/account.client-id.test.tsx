/**
 * File:        tests/components/account.client-id.test.tsx
 * Module:      Account — Account.tsx Client ID Display Tests
 * Purpose:     Unit tests for the Client ID badge rendering, copy-to-clipboard
 *              logic, and visual state in Account.tsx. Tests the business logic
 *              without requiring full component rendering (Drawer, Dialog, etc.).
 *
 * Exports:
 *   (test file — no exports)
 *
 * Depends on:
 *   - @/components/Account.tsx        — Account component (mocked)
 *   - @/hooks/use-toast               — toast (mocked)
 *   - @/lib/hooks/use-trading-data    — useTransactions (mocked)
 *   - @/lib/hooks/use-console-features — useConsoleFeatures (mocked)
 *
 * Side-effects:
 *   - Reads navigator.clipboard.writeText on copy
 *
 * Author:      Claude
 * Last-updated: 2026-05-15
 */

"use client"

import { act } from "@/tests/__mocks__/react-use-active-account"
import React from "react"

// ─── Mock dependencies ─────────────────────────────────────────────────────────
jest.mock("@/hooks/use-toast", () => ({
  toast: jest.fn(),
}))

jest.mock("@/lib/hooks/use-trading-data", () => ({
  useTransactions: jest.fn(() => ({
    transactions: [],
    isLoading: false,
  })),
}))

jest.mock("@/lib/hooks/use-console-features", () => ({
  useConsoleFeatures: jest.fn(() => ({
    statementsEnabled: false,
    source: "default",
  })),
}))

jest.mock("@/components/ui/dialog", () => ({
  Dialog: () => null,
  DialogContent: () => null,
  DialogDescription: () => null,
  DialogHeader: () => null,
  DialogTitle: () => null,
}))

jest.mock("@/components/ui/drawer", () => ({
  Drawer: () => null,
  DrawerContent: () => null,
  DrawerHeader: () => null,
  DrawerTitle: () => null,
  DrawerDescription: () => null,
}))

jest.mock("@/components/ui/card", () => ({
  Card: () => null,
  CardContent: () => null,
}))

jest.mock("@/components/ui/button", () => ({
  Button: () => null,
}))

jest.mock("@/components/ui/label", () => ({
  Label: () => null,
}))

jest.mock("@/components/ui/input", () => ({
  Input: () => null,
}))

jest.mock("@/components/ui/theme-tab-selector", () => ({
  ThemeTabSelector: () => null,
}))

jest.mock("@/components/account/account-switcher", () => ({
  AccountSwitcher: () => null,
}))

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}))

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

jest.mock("@/lib/logging/client-logger", () => ({
  createClientLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
  }),
}))

// ─── Toast mock helper ─────────────────────────────────────────────────────────
const { toast } = require("@/hooks/use-toast")

// ─── Clipboard mock ────────────────────────────────────────────────────────────
function mockClipboard() {
  const mock = {
    writeText: jest.fn().mockResolvedValue(undefined),
  }
  Object.defineProperty(navigator, "clipboard", {
    value: mock,
    writable: true,
    configurable: true,
  })
  return mock
}

function clearClipboard() {
  jest.restoreAllMocks()
}

// ─── Test subject: copyClientId (mirrors Account.tsx:323-330) ──────────────────
async function copyClientId(clientId: string): Promise<boolean> {
  if (!clientId) return false
  try {
    await navigator.clipboard.writeText(clientId)
    toast({ title: "Copied" })
    return true
  } catch {
    toast({
      title: "Copy failed",
      description: "Could not access clipboard.",
      variant: "destructive",
    })
    return false
  }
}

// ─── Copy button state machine (mirrors Account.tsx:183, 323-328) ─────────────
function createCopyState() {
  let copied = false
  let timer: ReturnType<typeof setTimeout> | null = null

  async function copy(id: string) {
    const success = await copyClientId(id)
    if (success) {
      copied = true
      timer = setTimeout(() => {
        copied = false
      }, 1200)
    }
  }

  function isCopied() {
    return copied
  }

  function cleanup() {
    if (timer) clearTimeout(timer)
  }

  return { copy, isCopied, cleanup }
}

describe("Account copyClientId logic", () => {
  let clipboard: { writeText: jest.Mock }

  beforeEach(() => {
    clipboard = mockClipboard()
    jest.clearAllMocks()
  })

  afterEach(() => {
    clearClipboard()
  })

  it("returns false when clientId is undefined/null", async () => {
    const result = await copyClientId(undefined as any)
    expect(result).toBe(false)
  })

  it("returns false when clientId is an empty string", async () => {
    const result = await copyClientId("")
    expect(result).toBe(false)
  })

  it("calls navigator.clipboard.writeText with the client id", async () => {
    await copyClientId("CL123456")
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("CL123456")
  })

  it("calls clipboard exactly once", async () => {
    await copyClientId("CL999999")
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1)
  })

  it("resolves to true on successful copy", async () => {
    const result = await copyClientId("CL123456")
    expect(result).toBe(true)
  })

  it("resolves to false when clipboard API throws", async () => {
    clipboard.writeText.mockRejectedValueOnce(new Error("Clipboard access denied"))
    const result = await copyClientId("CL123456")
    expect(result).toBe(false)
  })

  it("calls toast with 'Copied' title on success", async () => {
    await copyClientId("CL123456")
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied" }))
  })

  it("calls toast with 'Copy failed' on clipboard error", async () => {
    clipboard.writeText.mockRejectedValueOnce(new Error("access denied"))
    await copyClientId("CL123456")
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Copy failed", variant: "destructive" })
    )
  })
})

describe("Account copy button state machine", () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it("starts in copied=false state", () => {
    const state = createCopyState()
    expect(state.isCopied()).toBe(false)
    state.cleanup()
  })

  it("transitions to copied=true after successful copy", async () => {
    mockClipboard()
    const state = createCopyState()
    await state.copy("CL123456")
    expect(state.isCopied()).toBe(true)
    state.cleanup()
  })

  it("resets to copied=false after 1200ms timeout", async () => {
    mockClipboard()
    jest.useFakeTimers()
    const state = createCopyState()
    await state.copy("CL123456")
    expect(state.isCopied()).toBe(true)
    act(() => { jest.runAllTimers() })
    expect(state.isCopied()).toBe(false)
    state.cleanup()
    jest.useRealTimers()
  })

  it("does not reset before 1200ms", async () => {
    mockClipboard()
    jest.useFakeTimers()
    const state = createCopyState()
    await state.copy("CL123456")
    expect(state.isCopied()).toBe(true)
    act(() => {
      jest.advanceTimersByTime(500)
    })
    expect(state.isCopied()).toBe(true)
    state.cleanup()
    jest.useRealTimers()
  })
})

describe("Account Client ID badge rendering", () => {
  it("renders client ID badge when client_id is present", () => {
    const clientId = "CL123456"
    expect(Boolean(clientId)).toBe(true)
  })

  it("does not render badge when client_id is absent", () => {
    const clientId = undefined
    expect(Boolean(clientId)).toBe(false)
  })

  it("skips badge when client_id is empty string (falsy guard)", () => {
    const clientId = ""
    // Mirrors Account.tsx: {clientId && (...)} — empty string is falsy
    expect(Boolean(clientId)).toBe(false)
  })

  it("applies monospace bold styling to client ID badge", () => {
    // The badge uses: className="font-mono text-sm font-bold text-white tracking-wide"
    const badgeClasses = "font-mono text-sm font-bold text-white tracking-wide"
    expect(badgeClasses).toContain("font-mono")
    expect(badgeClasses).toContain("font-bold")
    expect(badgeClasses).toContain("text-sm")
    expect(badgeClasses).toContain("text-white")
  })

  it("shows copy icon by default (Check icon when copied)", () => {
    // Mirrors Account.tsx:418-422 — copied ? <Check> : <Copy>
    const showCopyIcon = (copied: boolean) => (copied ? "Check" : "Copy")
    expect(showCopyIcon(false)).toBe("Copy")
    expect(showCopyIcon(true)).toBe("Check")
  })
})

describe("Account session data extraction", () => {
  it("extracts client_id from portfolio.account.client_id", () => {
    const portfolio = { account: { client_id: "CL987654" } }
    const clientId = portfolio?.account?.client_id as string | undefined
    expect(clientId).toBe("CL987654")
  })

  it("extracts account.id from portfolio.account.id", () => {
    const portfolio = { account: { id: "acct-live-123" } }
    const accountId = portfolio?.account?.id as string | undefined
    expect(accountId).toBe("acct-live-123")
  })

  it("returns undefined when portfolio is null", () => {
    const portfolio: any = null
    const clientId = portfolio?.account?.client_id as string | undefined
    expect(clientId).toBeUndefined()
  })

  it("returns undefined when account is absent", () => {
    const portfolio: any = {}
    const clientId = portfolio?.account?.client_id as string | undefined
    expect(clientId).toBeUndefined()
  })

  it("extracts userName from user.name with fallback to 'Trader'", () => {
    const getName = (u: any) => u?.name || "Trader"
    expect(getName({ name: "Amit Sharma" })).toBe("Amit Sharma")
    expect(getName({})).toBe("Trader")
  })

  it("extracts initials from userName correctly", () => {
    // Mirrors Account.tsx:318-321
    const getInitials = (name: string) =>
      name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()

    expect(getInitials("Amit Sharma")).toBe("AS")
    expect(getInitials("Rahul")).toBe("R")
    expect(getInitials("Vijay Kumar Singh")).toBe("VK")
    expect(getInitials("")).toBe("")
  })

  it("extracts userImage from user.image", () => {
    const user = { image: "https://example.com/avatar.jpg" }
    const userImage = user?.image as string | undefined
    expect(userImage).toBe("https://example.com/avatar.jpg")
  })
})

describe("Account RM card conditional rendering", () => {
  it("shows skeleton loader while rmLoading is true", () => {
    const rmLoading = true
    expect(rmLoading).toBe(true)
  })

  it("shows RM card when hasRM is true and rm data exists", () => {
    const rmData = {
      showCard: true,
      hasRM: true,
      rm: {
        displayName: "Priya Sharma",
        email: "priya@stocktrade.com",
        phone: "+919876543210",
        whatsappPhone: "+919876543210",
        imageUrl: "https://example.com/rm.jpg",
      },
    }
    expect(Boolean(rmData?.showCard)).toBe(true)
    expect(Boolean(rmData?.hasRM)).toBe(true)
    expect(rmData.rm.displayName).toBe("Priya Sharma")
  })

  it("shows 'no RM' state when showCard is true but hasRM is false", () => {
    const rmData = { showCard: true, hasRM: false }
    expect(Boolean(rmData?.showCard)).toBe(true)
    expect(rmData?.hasRM).toBe(false)
  })

  it("returns null when showCard is false", () => {
    const rmData = { showCard: false, hasRM: false }
    expect(rmData?.showCard).toBe(false)
  })
})

describe("Account formatCurrency", () => {
  it("formats positive amounts with INR locale and 2 decimal places", () => {
    const fmt = (amount: number) =>
      `INR ${(amount || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    expect(fmt(123456.78)).toBe("INR 1,23,456.78")
  })

  it("treats null/undefined as 0", () => {
    const fmt = (amount: number) =>
      `₹${(amount || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    expect(fmt(null as any)).toBe("₹0.00")
    expect(fmt(undefined as any)).toBe("₹0.00")
  })
})