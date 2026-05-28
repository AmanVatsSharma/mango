/**
 * @file tests/trading/trading-access.test.ts
 * @module tests-trading
 * @description Unit tests for authenticated trading ownership guards.
 * @author StockTrade
 * @created 2026-02-15
 */

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: { findUnique: jest.fn() },
    order: { findUnique: jest.fn() },
    position: { findUnique: jest.fn() },
  },
}))

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import {
  assertRequestedUserScope,
  assertOrderOwnership,
  assertTradingAccountOwnership,
  getRequestSearchParams,
  getOwnedPositionContext,
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
  TradingAccessError,
} from "@/lib/server/trading-access"

const authMock = auth as jest.Mock
const tradingAccountFindUniqueMock = (prisma as any).tradingAccount.findUnique as jest.Mock
const orderFindUniqueMock = (prisma as any).order.findUnique as jest.Mock
const positionFindUniqueMock = (prisma as any).position.findUnique as jest.Mock

describe("trading-access guards", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("requireAuthenticatedUserId returns session user id", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    await expect(requireAuthenticatedUserId()).resolves.toBe("user-1")
  })

  it("requireAuthenticatedUserId throws 401 without session", async () => {
    authMock.mockResolvedValue(null)
    await expect(requireAuthenticatedUserId()).rejects.toMatchObject({
      statusCode: 401,
      message: "Unauthorized",
    })
  })

  it("getRequestSearchParams parses absolute urls", () => {
    const searchParams = getRequestSearchParams({ url: "http://localhost/api/trading/orders/list?userId=user-1&limit=10" })
    expect(searchParams.get("userId")).toBe("user-1")
    expect(searchParams.get("limit")).toBe("10")
  })

  it("getRequestSearchParams parses URL-object request urls", () => {
    const searchParams = getRequestSearchParams({
      url: new URL("http://localhost/api/trading/orders/list?userId=user-url-object&limit=25") as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-url-object")
    expect(searchParams.get("limit")).toBe("25")
  })

  it("getRequestSearchParams parses function-valued request urls", () => {
    const searchParams = getRequestSearchParams({
      url: () => "http://localhost/api/trading/orders/list?userId=user-url-function&limit=26",
    } as any)
    expect(searchParams.get("userId")).toBe("user-url-function")
    expect(searchParams.get("limit")).toBe("26")
  })

  it("getRequestSearchParams parses URL-like pathname/search object urls", () => {
    const searchParams = getRequestSearchParams({
      url: {
        pathname: "/api/trading/orders/list",
        search: "userId=user-path-search&limit=30",
      } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-path-search")
    expect(searchParams.get("limit")).toBe("30")
  })

  it("getRequestSearchParams strips query/hash from URL-like pathname values", () => {
    const searchParams = getRequestSearchParams({
      url: {
        pathname: "/api/trading/orders/list?pre=1#anchor",
        search: "userId=user-pathname-sanitized&limit=30a",
      } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-pathname-sanitized")
    expect(searchParams.get("limit")).toBe("30a")
    expect(searchParams.get("pre")).toBeNull()
  })

  it("getRequestSearchParams parses URL-like objects with URLSearchParams search values", () => {
    const searchParams = getRequestSearchParams({
      url: {
        pathname: "/api/trading/orders/list",
        search: new URLSearchParams("userId=user-path-search-object&limit=31"),
      } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-path-search-object")
    expect(searchParams.get("limit")).toBe("31")
  })

  it("getRequestSearchParams parses URL-like objects with nested href values", () => {
    const searchParams = getRequestSearchParams({
      url: {
        href: { href: "http://localhost/api/trading/orders/list?userId=user-href-nested&limit=32" },
      } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-href-nested")
    expect(searchParams.get("limit")).toBe("32")
  })

  it("getRequestSearchParams parses URL-like objects with Symbol.toPrimitive url values", () => {
    const searchParams = getRequestSearchParams({
      url: {
        [Symbol.toPrimitive]: () => "http://localhost/api/trading/orders/list?userId=user-symbol-url&limit=33",
      } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-symbol-url")
    expect(searchParams.get("limit")).toBe("33")
  })

  it("getRequestSearchParams tolerates URL-like objects with throwing href getter", () => {
    const urlLike = {
      get href() {
        throw new Error("href unavailable")
      },
      toString: () => "/api/trading/account?userId=user-href-fallback",
    }
    const searchParams = getRequestSearchParams({ url: urlLike as any } as any)
    expect(searchParams.get("userId")).toBe("user-href-fallback")
  })

  it("getRequestSearchParams falls back when URL-like toString throws", () => {
    const searchParams = getRequestSearchParams({
      url: { toString: () => { throw new Error("url serialization failed") } } as any,
      nextUrl: { search: "?userId=user-toString-fallback" },
    } as any)
    expect(searchParams.get("userId")).toBe("user-toString-fallback")
  })

  it("getRequestSearchParams parses relative urls using fallback base", () => {
    const searchParams = getRequestSearchParams({ url: "/api/trading/account?userId=user-2" })
    expect(searchParams.get("userId")).toBe("user-2")
  })

  it("getRequestSearchParams parses whitespace-padded urls", () => {
    const searchParams = getRequestSearchParams({ url: "  /api/trading/orders/list?userId=user-7  " })
    expect(searchParams.get("userId")).toBe("user-7")
  })

  it("getRequestSearchParams returns empty params when url value is missing", () => {
    const searchParams = getRequestSearchParams({ url: "" } as any)
    expect(searchParams.get("userId")).toBeNull()
  })

  it("getRequestSearchParams falls back when request url getter throws", () => {
    const req = {
      get url() {
        throw new Error("url unavailable")
      },
      nextUrl: { search: "?userId=user-getter-fallback" },
    }
    const searchParams = getRequestSearchParams(req as any)
    expect(searchParams.get("userId")).toBe("user-getter-fallback")
  })

  it("getRequestSearchParams falls back to nextUrl.searchParams when url is missing", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { searchParams: new URLSearchParams("userId=user-3&view=compact") },
    } as any)
    expect(searchParams.get("userId")).toBe("user-3")
    expect(searchParams.get("view")).toBe("compact")
  })

  it("getRequestSearchParams falls back to nextUrl.searchParams when url parsing fails", () => {
    const searchParams = getRequestSearchParams({
      url: "http://[invalid-host",
      nextUrl: { searchParams: new URLSearchParams("orderId=ord-9") },
    } as any)
    expect(searchParams.get("orderId")).toBe("ord-9")
  })

  it("getRequestSearchParams accepts nextUrl.searchParams string values", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { searchParams: "?userId=user-3b&view=table" as any },
    } as any)
    expect(searchParams.get("userId")).toBe("user-3b")
    expect(searchParams.get("view")).toBe("table")
  })

  it("getRequestSearchParams accepts nextUrl.searchParams full-url string values", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { searchParams: "http://localhost/api/trading/orders/list?userId=user-3b-url&view=url-string" as any },
    } as any)
    expect(searchParams.get("userId")).toBe("user-3b-url")
    expect(searchParams.get("view")).toBe("url-string")
  })

  it("getRequestSearchParams accepts object nextUrl.searchParams records", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { searchParams: { userId: "user-3c", view: "tiles" } as any },
    } as any)
    expect(searchParams.get("userId")).toBe("user-3c")
    expect(searchParams.get("view")).toBe("tiles")
  })

  it("getRequestSearchParams accepts iterable nextUrl.searchParams tuples", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { searchParams: [["userId", "user-3d"], ["view", "depth"]] as any },
    } as any)
    expect(searchParams.get("userId")).toBe("user-3d")
    expect(searchParams.get("view")).toBe("depth")
  })

  it("getRequestSearchParams falls back to nextUrl.search string when searchParams are unavailable", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { search: "?userId=user-4&mode=full" },
    } as any)
    expect(searchParams.get("userId")).toBe("user-4")
    expect(searchParams.get("mode")).toBe("full")
  })

  it("getRequestSearchParams accepts function-valued nextUrl.searchParams", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { searchParams: () => "userId=user-4g&mode=function-search-params" } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-4g")
    expect(searchParams.get("mode")).toBe("function-search-params")
  })

  it("getRequestSearchParams accepts Symbol.toPrimitive nextUrl.searchParams", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        searchParams: {
          [Symbol.toPrimitive]: () => "userId=user-4g-symbol&mode=symbol-search-params",
        } as any,
      } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-4g-symbol")
    expect(searchParams.get("mode")).toBe("symbol-search-params")
  })

  it("getRequestSearchParams accepts function-valued nextUrl.search fallback", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { search: () => "?userId=user-4h&mode=function-search" } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-4h")
    expect(searchParams.get("mode")).toBe("function-search")
  })

  it("getRequestSearchParams accepts full-url nextUrl.search fallback values", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { search: "http://localhost/api/trading/orders/list?userId=user-4h-url&mode=url-search" } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-4h-url")
    expect(searchParams.get("mode")).toBe("url-search")
  })

  it("getRequestSearchParams accepts Symbol.toPrimitive nextUrl.search fallback", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        search: {
          [Symbol.toPrimitive]: () => "?userId=user-4h-symbol&mode=symbol-search",
        } as any,
      } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-4h-symbol")
    expect(searchParams.get("mode")).toBe("symbol-search")
  })

  it("getRequestSearchParams falls back to nextUrl.href query when search fields are unavailable", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { href: "http://localhost/api/trading/orders/list?userId=user-4d&mode=href" } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-4d")
    expect(searchParams.get("mode")).toBe("href")
  })

  it("getRequestSearchParams falls back to function-valued nextUrl.href query values", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        href: () => "http://localhost/api/trading/orders/list?userId=user-4d-fn&mode=href-function",
      } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-4d-fn")
    expect(searchParams.get("mode")).toBe("href-function")
  })

  it("getRequestSearchParams falls back to object-backed nextUrl.href query values", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        href: {
          toString: () => "http://localhost/api/trading/orders/list?userId=user-4e&mode=href-object",
        },
      } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-4e")
    expect(searchParams.get("mode")).toBe("href-object")
  })

  it("getRequestSearchParams falls back to nextUrl object toString query values", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        toString: () => "http://localhost/api/trading/orders/list?userId=user-4f&mode=nexturl-object",
      } as any,
    } as any)
    expect(searchParams.get("userId")).toBe("user-4f")
    expect(searchParams.get("mode")).toBe("nexturl-object")
  })

  it("getRequestSearchParams falls back to nextUrl.search URLSearchParams values", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { search: new URLSearchParams("userId=user-4b&mode=compact") as any },
    } as any)
    expect(searchParams.get("userId")).toBe("user-4b")
    expect(searchParams.get("mode")).toBe("compact")
  })

  it("getRequestSearchParams falls back to nextUrl.search toString values", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: { search: { toString: () => "?userId=user-4c&mode=algo" } as any },
    } as any)
    expect(searchParams.get("userId")).toBe("user-4c")
    expect(searchParams.get("mode")).toBe("algo")
  })

  it("getRequestSearchParams falls back to nextUrl.search string when searchParams serialization fails", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        searchParams: { toString: () => { throw new Error("broken") } },
        search: "?userId=user-5",
      },
    } as any)
    expect(searchParams.get("userId")).toBe("user-5")
  })

  it("getRequestSearchParams falls back to nextUrl.search when searchParams getter throws", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        get searchParams() {
          throw new Error("searchParams unavailable")
        },
        search: "?userId=user-searchparams-getter-fallback",
      },
    } as any)
    expect(searchParams.get("userId")).toBe("user-searchparams-getter-fallback")
  })

  it("getRequestSearchParams falls back to nextUrl.search string when serialized searchParams are empty", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        searchParams: { toString: () => "" },
        search: "?userId=user-6",
      },
    } as any)
    expect(searchParams.get("userId")).toBe("user-6")
  })

  it("getRequestSearchParams still uses searchParams when search getter throws", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        searchParams: new URLSearchParams("userId=user-search-getter-throws"),
        get search() {
          throw new Error("search unavailable")
        },
      },
    } as any)
    expect(searchParams.get("userId")).toBe("user-search-getter-throws")
  })

  it("getRequestSearchParams ignores plain-object searchParams serialization artifacts", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        searchParams: {},
        search: "?userId=user-8&view=summary",
      },
    } as any)
    expect(searchParams.get("userId")).toBe("user-8")
    expect(searchParams.get("view")).toBe("summary")
  })

  it("getRequestSearchParams accepts nextUrl.searchParams serialization with question-prefix", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      nextUrl: {
        searchParams: { toString: () => "?userId=user-9&mode=lite" },
      },
    } as any)
    expect(searchParams.get("userId")).toBe("user-9")
    expect(searchParams.get("mode")).toBe("lite")
  })

  it("getRequestSearchParams returns empty params when nextUrl getter throws", () => {
    const searchParams = getRequestSearchParams({
      url: "",
      get nextUrl() {
        throw new Error("nextUrl unavailable")
      },
    } as any)
    expect(searchParams.get("userId")).toBeNull()
  })

  it("assertRequestedUserScope allows missing requested user", () => {
    expect(() => assertRequestedUserScope(undefined, "user-1")).not.toThrow()
    expect(() => assertRequestedUserScope("", "user-1")).not.toThrow()
  })

  it("assertRequestedUserScope trims and validates requested user id", () => {
    expect(() => assertRequestedUserScope(" user-1 ", "user-1")).not.toThrow()
    expect(() => assertRequestedUserScope("user-2", "user-1")).toThrow("Forbidden")
  })

  it("assertRequestedUserScope supports custom forbidden message", () => {
    expect(() => assertRequestedUserScope("user-2", "user-1", "Scope mismatch")).toThrow("Scope mismatch")
  })

  it("assertRequestedUserScope rejects non-string requested user values", () => {
    expect(() => assertRequestedUserScope(123, "user-1")).toThrow("Invalid user scope")
    expect(() => assertRequestedUserScope({ id: "user-1" }, "user-1")).toThrow("Invalid user scope")
  })

  it("assertRequestedUserScope rejects excessively long requested user ids", () => {
    expect(() => assertRequestedUserScope("u".repeat(200), "user-1")).toThrow("Invalid user scope")
  })

  it("assertTradingAccountOwnership throws 404 for missing account", async () => {
    tradingAccountFindUniqueMock.mockResolvedValue(null)
    await expect(assertTradingAccountOwnership("acct-1", "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Trading account not found",
    })
  })

  it("assertTradingAccountOwnership rejects blank account id before DB lookup", async () => {
    await expect(assertTradingAccountOwnership("   ", "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Trading account not found",
    })
    expect(tradingAccountFindUniqueMock).not.toHaveBeenCalled()
  })

  it("assertTradingAccountOwnership rejects oversized account id before DB lookup", async () => {
    await expect(assertTradingAccountOwnership("a".repeat(200), "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Trading account not found",
    })
    expect(tradingAccountFindUniqueMock).not.toHaveBeenCalled()
  })

  it("assertTradingAccountOwnership throws 403 for account mismatch", async () => {
    tradingAccountFindUniqueMock.mockResolvedValue({ id: "acct-1", userId: "user-2" })
    await expect(assertTradingAccountOwnership("acct-1", "user-1")).rejects.toMatchObject({
      statusCode: 403,
      message: "Forbidden",
    })
  })

  it("assertTradingAccountOwnership passes for owned account", async () => {
    tradingAccountFindUniqueMock.mockResolvedValue({ id: "acct-1", userId: "user-1" })
    await expect(assertTradingAccountOwnership("acct-1", "user-1")).resolves.toBeUndefined()
  })

  it("assertTradingAccountOwnership trims whitespace-padded account id", async () => {
    tradingAccountFindUniqueMock.mockResolvedValue({ id: "acct-1", userId: "user-1" })
    await expect(assertTradingAccountOwnership(" acct-1 ", "user-1")).resolves.toBeUndefined()
    expect(tradingAccountFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      select: { id: true, userId: true },
    })
  })

  it("assertOrderOwnership throws 404 for missing order", async () => {
    orderFindUniqueMock.mockResolvedValue(null)
    await expect(assertOrderOwnership("order-1", "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Order not found",
    })
  })

  it("assertOrderOwnership rejects blank order ids before DB lookup", async () => {
    await expect(assertOrderOwnership("   ", "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Order not found",
    })
    expect(orderFindUniqueMock).not.toHaveBeenCalled()
  })

  it("assertOrderOwnership rejects oversized order ids before DB lookup", async () => {
    await expect(assertOrderOwnership("o".repeat(200), "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Order not found",
    })
    expect(orderFindUniqueMock).not.toHaveBeenCalled()
  })

  it("assertOrderOwnership throws 403 for foreign order", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: "order-1", tradingAccount: { userId: "user-2" } })
    await expect(assertOrderOwnership("order-1", "user-1")).rejects.toMatchObject({
      statusCode: 403,
      message: "Forbidden",
    })
  })

  it("assertOrderOwnership passes for owned order", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: "order-1", tradingAccount: { userId: "user-1" } })
    await expect(assertOrderOwnership("order-1", "user-1")).resolves.toBeUndefined()
  })

  it("assertOrderOwnership trims whitespace-padded order id", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: "order-1", tradingAccount: { userId: "user-1" } })
    await expect(assertOrderOwnership(" order-1 ", "user-1")).resolves.toBeUndefined()
    expect(orderFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "order-1" },
      include: { tradingAccount: { select: { userId: true } } },
    })
  })

  it("assertOrderOwnership throws 404 when order tradingAccount relation is missing", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: "order-1", tradingAccount: null })
    await expect(assertOrderOwnership("order-1", "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Order not found",
    })
  })

  it("getOwnedPositionContext throws 404 for missing position", async () => {
    positionFindUniqueMock.mockResolvedValue(null)

    await expect(getOwnedPositionContext("pos-missing", "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Position not found",
    })
  })

  it("getOwnedPositionContext rejects blank position ids before DB lookup", async () => {
    await expect(getOwnedPositionContext("   ", "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Position not found",
    })
    expect(positionFindUniqueMock).not.toHaveBeenCalled()
  })

  it("getOwnedPositionContext rejects oversized position ids before DB lookup", async () => {
    await expect(getOwnedPositionContext("p".repeat(200), "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Position not found",
    })
    expect(positionFindUniqueMock).not.toHaveBeenCalled()
  })

  it("getOwnedPositionContext throws 404 when position account relation is missing", async () => {
    positionFindUniqueMock.mockResolvedValue({
      id: "pos-1",
      tradingAccountId: "acct-1",
      tradingAccount: null,
    })

    await expect(getOwnedPositionContext("pos-1", "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Position not found",
    })
  })

  it("getOwnedPositionContext returns owned context", async () => {
    positionFindUniqueMock.mockResolvedValue({
      id: "pos-1",
      tradingAccountId: "acct-1",
      tradingAccount: { userId: "user-1" },
    })

    await expect(getOwnedPositionContext("pos-1", "user-1")).resolves.toEqual({
      positionId: "pos-1",
      tradingAccountId: "acct-1",
    })
  })

  it("getOwnedPositionContext trims whitespace-padded position id", async () => {
    positionFindUniqueMock.mockResolvedValue({
      id: "pos-1",
      tradingAccountId: "acct-1",
      tradingAccount: { userId: "user-1" },
    })

    await expect(getOwnedPositionContext(" pos-1 ", "user-1")).resolves.toEqual({
      positionId: "pos-1",
      tradingAccountId: "acct-1",
    })
    expect(positionFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "pos-1" },
      select: {
        id: true,
        tradingAccountId: true,
        tradingAccount: { select: { userId: true } },
      },
    })
  })

  it("getOwnedPositionContext throws 403 for foreign position", async () => {
    positionFindUniqueMock.mockResolvedValue({
      id: "pos-1",
      tradingAccountId: "acct-1",
      tradingAccount: { userId: "user-2" },
    })

    await expect(getOwnedPositionContext("pos-1", "user-1")).rejects.toMatchObject({
      statusCode: 403,
      message: "Forbidden",
    })
  })

  it("resolveTradingErrorResponse maps TradingAccessError status", () => {
    const mapped = resolveTradingErrorResponse(new TradingAccessError("Forbidden", 403))
    expect(mapped).toEqual({ message: "Forbidden", status: 403 })
  })

  it("resolveTradingErrorResponse maps zod-like errors to 400", () => {
    const mapped = resolveTradingErrorResponse({
      name: "ZodError",
      issues: [{ message: "quantity required" }],
    })
    expect(mapped).toEqual({ message: "quantity required", status: 400 })
  })

  it("resolveTradingErrorResponse maps callable zod name and issue message to 400", () => {
    const mapped = resolveTradingErrorResponse({
      name: () => "ZodError",
      issues: [{ message: () => "instrument required" }],
    })
    expect(mapped).toEqual({ message: "instrument required", status: 400 })
  })

  it("resolveTradingErrorResponse falls back to 500 and default message", () => {
    const mapped = resolveTradingErrorResponse(null, "Invalid request", 500)
    expect(mapped).toEqual({ message: "Invalid request", status: 500 })
  })

  it("resolveTradingErrorResponse keeps explicit error message with custom fallback status", () => {
    const mapped = resolveTradingErrorResponse(new Error("upstream unavailable"), "Invalid request", 503)
    expect(mapped).toEqual({ message: "upstream unavailable", status: 503 })
  })

  it("resolveTradingErrorResponse falls back when error message is non-string", () => {
    const mapped = resolveTradingErrorResponse({ message: { text: "bad" } }, "Invalid request", 500)
    expect(mapped).toEqual({ message: "Invalid request", status: 500 })
  })

  it("resolveTradingErrorResponse normalizes invalid TradingAccessError status code", () => {
    const mapped = resolveTradingErrorResponse(new TradingAccessError("Forbidden", 700), "Invalid request", 502)
    expect(mapped).toEqual({ message: "Forbidden", status: 502 })
  })

  it("resolveTradingErrorResponse normalizes invalid fallback status code", () => {
    const mapped = resolveTradingErrorResponse(new Error("upstream unavailable"), "Invalid request", 900)
    expect(mapped).toEqual({ message: "upstream unavailable", status: 500 })
  })

  it("resolveTradingErrorResponse maps Prisma validation errors to 400", () => {
    const mapped = resolveTradingErrorResponse({
      name: "PrismaClientValidationError",
      message: "Invalid `where` argument",
    })
    expect(mapped).toEqual({ message: "Invalid `where` argument", status: 400 })
  })

  it("resolveTradingErrorResponse maps Prisma P2025 errors to 404", () => {
    const mapped = resolveTradingErrorResponse({
      name: "PrismaClientKnownRequestError",
      code: "P2025",
      message: "Record not found",
    })
    expect(mapped).toEqual({ message: "Record not found", status: 404 })
  })

  it("resolveTradingErrorResponse maps Prisma P2002 errors to 409", () => {
    const mapped = resolveTradingErrorResponse({
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      message: "Unique constraint failed",
    })
    expect(mapped).toEqual({ message: "Unique constraint failed", status: 409 })
  })

  it("resolveTradingErrorResponse maps generic Prisma P2 errors to 400", () => {
    const mapped = resolveTradingErrorResponse({
      name: "PrismaClientKnownRequestError",
      code: "P2011",
      message: "Null constraint violation",
    })
    expect(mapped).toEqual({ message: "Null constraint violation", status: 400 })
  })

  it("resolveTradingErrorResponse maps JSON parse syntax errors to 400", () => {
    const mapped = resolveTradingErrorResponse(
      new SyntaxError("Unexpected token } in JSON at position 12"),
      "Invalid request",
      500,
    )
    expect(mapped).toEqual({ message: "Unexpected token } in JSON at position 12", status: 400 })
  })

  it("resolveTradingErrorResponse maps JSON parse type errors to 400", () => {
    const parseTypeError = Object.assign(new TypeError("Failed to parse JSON body"), { name: "TypeError" })
    const mapped = resolveTradingErrorResponse(parseTypeError, "Invalid request", 500)
    expect(mapped).toEqual({ message: "Failed to parse JSON body", status: 400 })
  })

  it("resolveTradingErrorResponse keeps non-JSON type errors on fallback status", () => {
    const mapped = resolveTradingErrorResponse(new TypeError("Network request failed"), "Invalid request", 503)
    expect(mapped).toEqual({ message: "Network request failed", status: 503 })
  })

  it("resolveTradingErrorResponse honors generic statusCode when valid", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Too many requests",
      statusCode: 429,
    })
    expect(mapped).toEqual({ message: "Too many requests", status: 429 })
  })

  it("resolveTradingErrorResponse honors generic status when valid", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Service unavailable",
      status: 503,
    })
    expect(mapped).toEqual({ message: "Service unavailable", status: 503 })
  })

  it("resolveTradingErrorResponse honors nested cause status when valid", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Wrapped upstream failure",
      cause: { statusCode: "429" },
    })
    expect(mapped).toEqual({ message: "Wrapped upstream failure", status: 429 })
  })

  it("resolveTradingErrorResponse honors nested cause response status when valid", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Wrapped upstream failure",
      cause: { response: { statusCode: "504" } },
    })
    expect(mapped).toEqual({ message: "Wrapped upstream failure", status: 504 })
  })

  it("resolveTradingErrorResponse ignores invalid generic status values", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Service unavailable",
      statusCode: 200,
      status: 700,
    })
    expect(mapped).toEqual({ message: "Service unavailable", status: 500 })
  })

  it("resolveTradingErrorResponse accepts numeric-string statusCode", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Too many requests",
      statusCode: "429",
    })
    expect(mapped).toEqual({ message: "Too many requests", status: 429 })
  })

  it("resolveTradingErrorResponse accepts numeric-string status", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Gateway timeout",
      status: "504",
    })
    expect(mapped).toEqual({ message: "Gateway timeout", status: 504 })
  })

  it("resolveTradingErrorResponse accepts Symbol.toPrimitive wrapped statusCode", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Too many requests",
      statusCode: {
        [Symbol.toPrimitive]: () => "429",
      },
    })
    expect(mapped).toEqual({ message: "Too many requests", status: 429 })
  })

  it("resolveTradingErrorResponse accepts function-wrapped nested cause status", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Gateway timeout",
      cause: {
        response: {
          status: () => "504",
        },
      },
    })
    expect(mapped).toEqual({ message: "Gateway timeout", status: 504 })
  })

  it("resolveTradingErrorResponse accepts function-wrapped top-level message values", () => {
    const mapped = resolveTradingErrorResponse({
      message: () => "Wrapped message source",
      statusCode: 400,
    })
    expect(mapped).toEqual({ message: "Wrapped message source", status: 400 })
  })

  it("resolveTradingErrorResponse ignores invalid status strings", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Failure",
      statusCode: "error",
      status: "99",
    })
    expect(mapped).toEqual({ message: "Failure", status: 500 })
  })

  it("resolveTradingErrorResponse uses error field when message is missing", () => {
    const mapped = resolveTradingErrorResponse({
      error: "Account is blocked",
      statusCode: 403,
    })
    expect(mapped).toEqual({ message: "Account is blocked", status: 403 })
  })

  it("resolveTradingErrorResponse uses cause message when top-level message missing", () => {
    const mapped = resolveTradingErrorResponse({
      cause: { message: "Downstream timeout" },
      status: 504,
    })
    expect(mapped).toEqual({ message: "Downstream timeout", status: 504 })
  })

  it("resolveTradingErrorResponse uses callable cause message when top-level message missing", () => {
    const mapped = resolveTradingErrorResponse({
      cause: () => ({ message: "Callable downstream timeout" }),
      status: 504,
    })
    expect(mapped).toEqual({ message: "Callable downstream timeout", status: 504 })
  })

  it("resolveTradingErrorResponse uses string cause when object cause message is unavailable", () => {
    const mapped = resolveTradingErrorResponse({
      cause: "Downstream timeout string",
      status: 504,
    })
    expect(mapped).toEqual({ message: "Downstream timeout string", status: 504 })
  })

  it("resolveTradingErrorResponse uses statusText when other messages are missing", () => {
    const mapped = resolveTradingErrorResponse({
      status: 404,
      statusText: "Not Found",
    })
    expect(mapped).toEqual({ message: "Not Found", status: 404 })
  })

  it("resolveTradingErrorResponse uses callable cause statusText when other messages are missing", () => {
    const mapped = resolveTradingErrorResponse({
      status: 404,
      cause: () => ({ statusText: "Callable Not Found" }),
    })
    expect(mapped).toEqual({ message: "Callable Not Found", status: 404 })
  })

  it("resolveTradingErrorResponse uses http-client response data message and status", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Request failed with status code 502",
      response: {
        status: 502,
        data: { message: "Upstream gateway timeout" },
      },
    })
    expect(mapped).toEqual({ message: "Upstream gateway timeout", status: 502 })
  })

  it("resolveTradingErrorResponse uses string response data and numeric-string status", () => {
    const mapped = resolveTradingErrorResponse({
      response: {
        status: "429",
        data: "Upstream rate limit exceeded",
      },
    })
    expect(mapped).toEqual({ message: "Upstream rate limit exceeded", status: 429 })
  })

  it("resolveTradingErrorResponse uses nested object response data error message", () => {
    const mapped = resolveTradingErrorResponse({
      response: {
        status: 422,
        data: {
          error: { message: "Margin requirement exceeded" },
        },
      },
    })
    expect(mapped).toEqual({ message: "Margin requirement exceeded", status: 422 })
  })

  it("resolveTradingErrorResponse uses callable response data message values", () => {
    const mapped = resolveTradingErrorResponse({
      response: {
        status: 422,
        data: {
          message: () => "Callable response data message",
        },
      },
    })
    expect(mapped).toEqual({ message: "Callable response data message", status: 422 })
  })

  it("resolveTradingErrorResponse uses callable response wrapper values", () => {
    const mapped = resolveTradingErrorResponse({
      response: () => ({
        status: () => "429",
        data: () => ({ message: () => "Callable response wrapper message" }),
      }),
    })
    expect(mapped).toEqual({ message: "Callable response wrapper message", status: 429 })
  })

  it("resolveTradingErrorResponse uses nested response data wrapper message", () => {
    const mapped = resolveTradingErrorResponse({
      response: {
        status: 422,
        data: {
          data: { message: "Instrument has been disabled for trading" },
        },
      },
    })
    expect(mapped).toEqual({ message: "Instrument has been disabled for trading", status: 422 })
  })

  it("resolveTradingErrorResponse uses wrapped cause response data message and status", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Request failed",
      cause: {
        response: {
          status: "502",
          data: { message: "Upstream risk engine unavailable" },
        },
      },
    })
    expect(mapped).toEqual({ message: "Upstream risk engine unavailable", status: 502 })
  })

  it("resolveTradingErrorResponse uses first message in response data errors array", () => {
    const mapped = resolveTradingErrorResponse({
      response: {
        status: 422,
        data: {
          errors: [{ message: "Price precision is invalid" }, { message: "Quantity missing" }],
        },
      },
    })
    expect(mapped).toEqual({ message: "Price precision is invalid", status: 422 })
  })

  it("resolveTradingErrorResponse uses string entry from response data issues array", () => {
    const mapped = resolveTradingErrorResponse({
      response: {
        status: 422,
        data: {
          issues: ["Stop loss must be below entry price"],
        },
      },
    })
    expect(mapped).toEqual({ message: "Stop loss must be below entry price", status: 422 })
  })

  it("resolveTradingErrorResponse ignores invalid http-client response status", () => {
    const mapped = resolveTradingErrorResponse({
      response: {
        status: 200,
        data: { error: "Transient dependency failure" },
      },
    })
    expect(mapped).toEqual({ message: "Transient dependency failure", status: 500 })
  })

  it("resolveTradingErrorResponse maps request url parse errors to 400", () => {
    const mapped = resolveTradingErrorResponse(
      Object.assign(new TypeError("Invalid URL"), { code: "ERR_INVALID_URL" }),
      "Invalid request",
      500,
    )
    expect(mapped).toEqual({ message: "Invalid URL", status: 400 })
  })

  it("resolveTradingErrorResponse maps timeout error codes to 504", () => {
    const mapped = resolveTradingErrorResponse({
      code: "ETIMEDOUT",
      message: "Socket timed out while connecting",
    })
    expect(mapped).toEqual({ message: "Socket timed out while connecting", status: 504 })
  })

  it("resolveTradingErrorResponse maps callable timeout error codes to 504", () => {
    const mapped = resolveTradingErrorResponse({
      code: () => "ECONNABORTED",
      message: "Socket timed out while connecting",
    })
    expect(mapped).toEqual({ message: "Socket timed out while connecting", status: 504 })
  })

  it("resolveTradingErrorResponse maps lowercase timeout error codes to 504", () => {
    const mapped = resolveTradingErrorResponse({
      code: "etimedout",
      message: "Socket timed out while connecting",
    })
    expect(mapped).toEqual({ message: "Socket timed out while connecting", status: 504 })
  })

  it("resolveTradingErrorResponse maps timeout name/message signatures to 504", () => {
    const mapped = resolveTradingErrorResponse(
      new Error("Upstream request timed out"),
      "Invalid request",
      500,
    )
    expect(mapped).toEqual({ message: "Upstream request timed out", status: 504 })
  })

  it("resolveTradingErrorResponse maps nested cause timeout codes to 504", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Request failed",
      cause: { code: "ECONNABORTED", message: "Socket timeout in downstream client" },
    })
    expect(mapped).toEqual({ message: "Request failed", status: 504 })
  })

  it("resolveTradingErrorResponse maps callable cause timeout codes to 504", () => {
    const mapped = resolveTradingErrorResponse({
      message: "Request failed",
      cause: () => ({ code: () => "ECONNABORTED", message: () => "Socket timeout in downstream client" }),
    })
    expect(mapped).toEqual({ message: "Request failed", status: 504 })
  })

  it("resolveTradingErrorResponse maps transient network error codes to 503", () => {
    const mapped = resolveTradingErrorResponse({
      code: "ECONNREFUSED",
      message: "Connection refused by upstream",
    })
    expect(mapped).toEqual({ message: "Connection refused by upstream", status: 503 })
  })

  it("resolveTradingErrorResponse maps Symbol.toPrimitive network error codes to 503", () => {
    const mapped = resolveTradingErrorResponse({
      code: { [Symbol.toPrimitive]: () => "EAI_AGAIN" },
      message: "Temporary dns lookup failed",
    })
    expect(mapped).toEqual({ message: "Temporary dns lookup failed", status: 503 })
  })

  it("resolveTradingErrorResponse maps lowercase transient network error codes to 503", () => {
    const mapped = resolveTradingErrorResponse({
      code: "enotfound",
      message: "DNS lookup failed for upstream host",
    })
    expect(mapped).toEqual({ message: "DNS lookup failed for upstream host", status: 503 })
  })

  it("resolveTradingErrorResponse maps nested cause network signatures to 503", () => {
    const mapped = resolveTradingErrorResponse({
      cause: { code: "EAI_AGAIN", message: "Temporary dns lookup failed" },
    })
    expect(mapped).toEqual({ message: "Temporary dns lookup failed", status: 503 })
  })

  it("resolveTradingErrorResponse maps fetch/network TypeError signatures to 503", () => {
    const mapped = resolveTradingErrorResponse(new TypeError("Fetch failed due to network error"))
    expect(mapped).toEqual({ message: "Fetch failed due to network error", status: 503 })
  })

  it("resolveTradingErrorResponse preserves top-level string errors", () => {
    const mapped = resolveTradingErrorResponse("Service temporarily unavailable", "Invalid request", 503)
    expect(mapped).toEqual({ message: "Service temporarily unavailable", status: 503 })
  })

  it("resolveTradingErrorResponse sanitizes top-level string errors", () => {
    const mapped = resolveTradingErrorResponse("  Service\ttemporarily\nunavailable   ", "Invalid request", 503)
    expect(mapped).toEqual({ message: "Service temporarily unavailable", status: 503 })
  })

  it("resolveTradingErrorResponse ignores non-string issue messages", () => {
    const mapped = resolveTradingErrorResponse({
      name: "ZodError",
      issues: [{ message: { text: "invalid" } }],
      message: "Validation failed",
    })
    expect(mapped).toEqual({ message: "Validation failed", status: 400 })
  })

  it("resolveTradingErrorResponse sanitizes whitespace-heavy messages", () => {
    const mapped = resolveTradingErrorResponse({
      message: "  failure\n\nwhile\tprocessing   request  ",
      statusCode: 500,
    })
    expect(mapped).toEqual({ message: "failure while processing request", status: 500 })
  })

  it("resolveTradingErrorResponse truncates overly long messages", () => {
    const mapped = resolveTradingErrorResponse({
      message: `error-${"x".repeat(400)}`,
      statusCode: 500,
    })

    expect(mapped.status).toBe(500)
    expect(mapped.message.length).toBe(300)
    expect(mapped.message.endsWith("…")).toBe(true)
  })
})

