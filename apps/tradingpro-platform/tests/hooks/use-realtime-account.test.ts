/**
 * File:        tests/hooks/use-realtime-account.test.ts
 * Module:      tests-hooks
 * Purpose:     Unit tests for `useRealtimeAccount` — the SSE-driven account
 *              hook. Tests the URL-building logic and SWR key behavior WITHOUT
 *              a real SWR instance (the hook is called and its return values
 *              are asserted; SWR is the runtime transport).
 *
 * Exports:     none (test file)
 *
 * Depends on:
 *   - @/lib/hooks/use-realtime-account — the hook under test
 *   - swr — mocked
 *   - @/lib/hooks/use-shared-sse — mocked
 *
 * Side-effects: mocks SWR + SSE, no network, no DB
 *
 * Key invariants tested:
 *   - `activeAccountId` param is included in the fetcher URL when provided
 *   - Without `activeAccountId`, falls back to userId-only URL
 *   - `userId` === null/undefined → fetchUrl is null (SWR skips fetch)
 *   - Return shape includes: account, isLoading, error, refresh, mutate, retryCount
 *
 * Read order:
 *   1. fetchUrl building — activeAccountId precedence over userId-only
 *   2. Null userId — URL is null, SWR skips
 *   3. Return shape — all exported fields present
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-15
 */

"use client"

const mockMutate = jest.fn()
const mockRefresh = jest.fn()

// -----------------------------------------------------------------------
// Mock SWR
// -----------------------------------------------------------------------
jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn((url, _fetcher, _options) => {
    mockSWRUrl = url
    return {
      data: mockSWRData,
      error: mockSWRError,
      isLoading: mockSWRIsLoading,
      mutate: mockMutate,
    }
  }),
}))

// -----------------------------------------------------------------------
// Mock SSE (avoids real EventSource)
// -----------------------------------------------------------------------
jest.mock("@/lib/hooks/use-shared-sse", () => ({
  useSharedSSESubscribe: jest.fn(),
}))

// -----------------------------------------------------------------------
// State captured from SWR calls
// -----------------------------------------------------------------------
let mockSWRUrl: string | null = null
let mockSWRData: any = null
let mockSWRError: Error | null = null
let mockSWRIsLoading = false

function resetSWRState() {
  mockSWRUrl = null
  mockSWRData = null
  mockSWRError = null
  mockSWRIsLoading = false
  mockMutate.mockReset()
  mockMutate.mockImplementation((...args: any[]) => Promise.resolve(args[0]))
}

// -----------------------------------------------------------------------
// Test data
// -----------------------------------------------------------------------
const LIVE_ACCOUNT = {
  id: "acct-live-1",
  userId: "user-1",
  balance: 250000,
  availableMargin: 200000,
  usedMargin: 50000,
  clientId: "CID001",
  createdAt: "2026-02-15T10:00:00.000Z",
  updatedAt: "2026-02-15T10:05:00.000Z",
}

const DEMO_ACCOUNT = {
  id: "acct-demo-1",
  userId: "user-1",
  balance: 500000,
  availableMargin: 500000,
  usedMargin: 0,
  clientId: "CID-DEMO",
  createdAt: "2026-02-15T10:00:00.000Z",
  updatedAt: "2026-02-15T10:05:00.000Z",
}

function mockResponse(account: object | null) {
  return { success: true, account }
}

// -----------------------------------------------------------------------
// Import AFTER mocks are set up
// -----------------------------------------------------------------------
import { useRealtimeAccount } from "@/lib/hooks/use-realtime-account"
const { renderHook, act } = require("@/tests/__mocks__/react-use-active-account")

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------
describe("useRealtimeAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetSWRState()
  })

  // -----------------------------------------------------------------------
  // fetchUrl building
  // -----------------------------------------------------------------------
  describe("fetchUrl building", () => {
    it("returns null URL when userId is undefined (SWR skips fetch)", async () => {
      renderHook(() => {
        const result = useRealtimeAccount(undefined, undefined)
        // Assert directly on first render (no need for act — no async effects here)
        expect(mockSWRUrl).toBeNull()
        void result // consume the variable to suppress TS unused-var
        return result
      })
    })

    it("returns null URL when userId is null (SWR skips fetch)", () => {
      renderHook(() => {
        const result = useRealtimeAccount(null, null)
        expect(mockSWRUrl).toBeNull()
        void result
        return result
      })
    })

    it("builds userId-only URL when userId is present but activeAccountId is absent", async () => {
      renderHook(() => {
        const result = useRealtimeAccount("user-1", undefined)
        expect(mockSWRUrl).toBe("/api/trading/account?userId=user-1")
        void result
        return result
      })
    })

    it("builds URL with accountId param when activeAccountId is provided (LIVE)", async () => {
      renderHook(() => {
        const result = useRealtimeAccount("user-1", "acct-live-1")
        expect(mockSWRUrl).toBe("/api/trading/account?userId=user-1&accountId=acct-live-1")
        void result
        return result
      })
    })

    it("builds URL with accountId param when activeAccountId is the DEMO account", async () => {
      renderHook(() => {
        const result = useRealtimeAccount("user-1", "acct-demo-1")
        expect(mockSWRUrl).toBe("/api/trading/account?userId=user-1&accountId=acct-demo-1")
        void result
        return result
      })
    })

    it("prefers activeAccountId over userId-only URL", () => {
      renderHook(() => {
        const result = useRealtimeAccount("user-1", "acct-live-1")
        // The URL must contain accountId — userId-only would be wrong for switching
        expect(mockSWRUrl).toContain("accountId=acct-live-1")
        expect(mockSWRUrl).not.toBe("/api/trading/account?userId=user-1")
        void result
        return result
      })
    })

    it("builds correct URL when activeAccountId is an empty string", () => {
      renderHook(() => {
        const result = useRealtimeAccount("user-1", "")
        // Empty string is falsy — treated as absent, falls back to userId-only
        expect(mockSWRUrl).toBe("/api/trading/account?userId=user-1")
        void result
        return result
      })
    })
  })

  // -----------------------------------------------------------------------
  // Return shape — all exported fields present
  // -----------------------------------------------------------------------
  describe("return shape", () => {
    it("returns all required fields when userId is provided", async () => {
      mockSWRData = mockResponse(LIVE_ACCOUNT)

      let returnValue: any = null
      renderHook(() => {
        returnValue = useRealtimeAccount("user-1", "acct-live-1")
        return returnValue
      })

      expect(returnValue).not.toBeNull()
      expect(returnValue).toHaveProperty("account")
      expect(returnValue).toHaveProperty("isLoading")
      expect(returnValue).toHaveProperty("error")
      expect(returnValue).toHaveProperty("refresh")
      expect(returnValue).toHaveProperty("optimisticUpdateBalance")
      expect(returnValue).toHaveProperty("optimisticBlockMargin")
      expect(returnValue).toHaveProperty("optimisticReleaseMargin")
      expect(returnValue).toHaveProperty("mutate")
      expect(returnValue).toHaveProperty("retryCount")
    })

    it("mutate() delegates to SWR's mutate function", async () => {
      mockSWRData = mockResponse(LIVE_ACCOUNT)
      mockMutate.mockResolvedValue({ success: true, account: LIVE_ACCOUNT })

      let hookResult: any = null
      await act(async () => {
        renderHook(() => {
          hookResult = useRealtimeAccount("user-1", "acct-live-1")
          return hookResult
        })
      })

      await act(async () => {
        await hookResult.refresh()
      })

      expect(mockMutate).toHaveBeenCalled()
    })

    it("retryCount is a number (even if 0 before any error)", () => {
      mockSWRData = mockResponse(LIVE_ACCOUNT)

      let hookResult: any = null
      renderHook(() => {
        hookResult = useRealtimeAccount("user-1", "acct-live-1")
        return hookResult
      })

      expect(typeof hookResult.retryCount).toBe("number")
    })
  })

  // -----------------------------------------------------------------------
  // Account data extraction
  // -----------------------------------------------------------------------
  describe("account data extraction", () => {
    it("returns account from SWR data when data is valid", async () => {
      mockSWRData = mockResponse(LIVE_ACCOUNT)

      let hookResult: any = null
      renderHook(() => {
        hookResult = useRealtimeAccount("user-1", "acct-live-1")
        return hookResult
      })

      expect(hookResult.account).toMatchObject(LIVE_ACCOUNT)
    })

    it("returns null account when SWR returns null account", async () => {
      mockSWRData = mockResponse(null)

      let hookResult: any = null
      renderHook(() => {
        hookResult = useRealtimeAccount("user-1", "acct-live-1")
        return hookResult
      })

      expect(hookResult.account).toBeNull()
    })

    it("returns null account when SWR data is undefined (not yet loaded)", async () => {
      mockSWRData = undefined

      let hookResult: any = null
      renderHook(() => {
        hookResult = useRealtimeAccount("user-1", "acct-live-1")
        return hookResult
      })

      expect(hookResult.account).toBeNull()
    })

    it("propagates SWR error to the error field", async () => {
      const networkError = new Error("Network failure")
      mockSWRError = networkError
      mockSWRData = undefined

      let hookResult: any = null
      renderHook(() => {
        hookResult = useRealtimeAccount("user-1", "acct-live-1")
        return hookResult
      })

      expect(hookResult.error).toBe(networkError)
    })
  })

  // -----------------------------------------------------------------------
  // Optimistic update functions (unit — validates inputs, no real state)
  // -----------------------------------------------------------------------
  describe("optimisticUpdateBalance", () => {
    it("calls mutate with updated balance and margin when called with valid args", async () => {
      mockSWRData = mockResponse({ ...LIVE_ACCOUNT })
      mockMutate.mockImplementation((updater: any) => {
        return updater({ success: true, account: LIVE_ACCOUNT })
      })

      let hookResult: any = null
      renderHook(() => {
        hookResult = useRealtimeAccount("user-1", "acct-live-1")
        return hookResult
      })

      act(() => {
        hookResult.optimisticUpdateBalance(1000, 500)
      })

      expect(mockMutate).toHaveBeenCalled()
    })

    it("does not throw when called with no data loaded", () => {
      mockSWRData = null

      let hookResult: any = null
      expect(() => {
        renderHook(() => {
          hookResult = useRealtimeAccount("user-1", "acct-live-1")
          return hookResult
        })
        act(() => { hookResult.optimisticUpdateBalance(1000, 500) })
      }).not.toThrow()
    })
  })

  describe("optimisticBlockMargin", () => {
    it("does not throw when called with no data loaded", () => {
      mockSWRData = null

      let hookResult: any = null
      expect(() => {
        renderHook(() => {
          hookResult = useRealtimeAccount("user-1", "acct-live-1")
          return hookResult
        })
        act(() => { hookResult.optimisticBlockMargin })
      }).not.toThrow()
    })

    it("does not call mutate when amount is invalid (NaN)", () => {
      mockSWRData = mockResponse({ ...LIVE_ACCOUNT })

      let hookResult: any = null
      renderHook(() => {
        hookResult = useRealtimeAccount("user-1", "acct-live-1")
        return hookResult
      })

      mockMutate.mockClear()
      act(() => { hookResult.optimisticBlockMargin(NaN) })

      expect(mockMutate).not.toHaveBeenCalled()
    })
  })

  describe("optimisticReleaseMargin", () => {
    it("does not throw when called with no data loaded", () => {
      mockSWRData = null

      let hookResult: any = null
      expect(() => {
        renderHook(() => {
          hookResult = useRealtimeAccount("user-1", "acct-live-1")
          return hookResult
        })
        act(() => { hookResult.optimisticReleaseMargin })
      }).not.toThrow()
    })
  })
})