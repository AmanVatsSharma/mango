/**
 * File: tests/common/api-telemetry.test.ts
 * Module: observability
 * Purpose: Verify API telemetry emits route/method status-safe logs.
 * Author: StockTrade
 * Last-updated: 2026-02-15
 */

import { withApiTelemetry } from "@/lib/observability/api-telemetry"
import { withRequest } from "@/lib/observability/logger"

jest.mock("@/lib/observability/logger", () => ({
  withRequest: jest.fn(),
}))

const withRequestMock = withRequest as jest.Mock

describe("withApiTelemetry", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("logs response status code for Response-like handler results", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: {
        "x-request-id": "req-123",
        "x-forwarded-for": "10.0.0.1",
      },
    })

    const response = new Response(JSON.stringify({ ok: true }), { status: 201 })
    const result = await withApiTelemetry(req, { name: "orders_post" }, async () => response)

    expect(result.result).toBe(response)
    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-123",
      ip: "10.0.0.1",
      route: "/api/trading/orders",
    })
    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "api_start",
        name: "orders_post",
        method: "POST",
        path: "/api/trading/orders",
      }),
    )
    expect(info).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event: "api_success",
        name: "orders_post",
        statusCode: 201,
      }),
    )
    expect(error).not.toHaveBeenCalled()
  })

  it("omits status code for non-Response handler results", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/funds", { method: "POST" })
    await withApiTelemetry(req, { name: "funds_post" }, async () => ({ ok: true }))

    expect(info).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event: "api_success",
        name: "funds_post",
        statusCode: undefined,
      }),
    )
    expect(error).not.toHaveBeenCalled()
  })

  it("captures numeric-string success status for response-like payloads", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/funds", { method: "POST" })
    await withApiTelemetry(req, { name: "funds_post" }, async () => ({ status: "202", ok: true }))

    expect(info).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event: "api_success",
        name: "funds_post",
        statusCode: 202,
      }),
    )
  })

  it("captures callable success status for response-like payloads", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/funds", { method: "POST" })
    await withApiTelemetry(req, { name: "funds_post" }, async () => ({ status: () => "204", ok: true }))

    expect(info).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event: "api_success",
        name: "funds_post",
        statusCode: 204,
      }),
    )
  })

  it("logs and rethrows handler errors", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/positions", { method: "PATCH" })

    await expect(
      withApiTelemetry(req, { name: "positions_patch" }, async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "positions_patch",
        statusCode: undefined,
        err: "boom",
      }),
    )
  })

  it("logs callable error message wrappers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/positions", { method: "PATCH" })

    await expect(
      withApiTelemetry(req, { name: "positions_patch" }, async () => {
        throw { statusCode: 400, message: () => "callable boom" }
      }),
    ).rejects.toEqual({ statusCode: 400, message: expect.any(Function) })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "positions_patch",
        statusCode: 400,
        err: "callable boom",
      }),
    )
  })

  it("logs normalized status code for known HTTP-style errors", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", { method: "DELETE" })
    await expect(
      withApiTelemetry(req, { name: "orders_delete" }, async () => {
        throw { status: "429", message: "Rate limited" }
      }),
    ).rejects.toEqual({ status: "429", message: "Rate limited" })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "orders_delete",
        statusCode: 429,
        err: "Rate limited",
      }),
    )
  })

  it("logs normalized status code for Symbol.toPrimitive wrapped errors", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", { method: "DELETE" })
    await expect(
      withApiTelemetry(req, { name: "orders_delete" }, async () => {
        throw {
          statusCode: {
            [Symbol.toPrimitive]: () => "429",
          },
          message: "Rate limited wrapper",
        }
      }),
    ).rejects.toEqual({
      statusCode: {
        [Symbol.toPrimitive]: expect.any(Function),
      },
      message: "Rate limited wrapper",
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "orders_delete",
        statusCode: 429,
        err: "Rate limited wrapper",
      }),
    )
  })

  it("logs normalized status code from http-client response status", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/positions", { method: "GET" })
    await expect(
      withApiTelemetry(req, { name: "positions_list" }, async () => {
        throw {
          message: "Request failed with status code 503",
          response: { status: "503" },
        }
      }),
    ).rejects.toEqual({
      message: "Request failed with status code 503",
      response: { status: "503" },
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "positions_list",
        statusCode: 503,
        errorName: undefined,
        err: "Request failed with status code 503",
      }),
    )
  })

  it("logs normalized status code from callable response wrappers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/positions", { method: "GET" })
    await expect(
      withApiTelemetry(req, { name: "positions_list" }, async () => {
        throw {
          message: "Request failed with status code 503",
          response: () => ({ status: () => "503" }),
        }
      }),
    ).rejects.toEqual({
      message: "Request failed with status code 503",
      response: expect.any(Function),
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "positions_list",
        statusCode: 503,
      }),
    )
  })

  it("logs normalized status code from nested cause status fields", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/positions", { method: "GET" })
    await expect(
      withApiTelemetry(req, { name: "positions_list" }, async () => {
        throw {
          message: "Wrapped downstream failure",
          cause: { statusCode: "504", message: "Downstream timeout" },
        }
      }),
    ).rejects.toEqual({
      message: "Wrapped downstream failure",
      cause: { statusCode: "504", message: "Downstream timeout" },
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "positions_list",
        statusCode: 504,
        err: "Wrapped downstream failure",
      }),
    )
  })

  it("logs normalized status code from callable nested cause status fields", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/positions", { method: "GET" })
    await expect(
      withApiTelemetry(req, { name: "positions_list" }, async () => {
        throw {
          message: "Wrapped downstream failure",
          cause: { statusCode: () => "504", message: "Downstream timeout" },
        }
      }),
    ).rejects.toEqual({
      message: "Wrapped downstream failure",
      cause: { statusCode: expect.any(Function), message: "Downstream timeout" },
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "positions_list",
        statusCode: 504,
        err: "Wrapped downstream failure",
      }),
    )
  })

  it("logs nested cause response status and message details", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/positions", { method: "GET" })
    await expect(
      withApiTelemetry(req, { name: "positions_list" }, async () => {
        throw {
          message: "Wrapped downstream failure",
          cause: {
            response: {
              status: "502",
              data: { message: "Upstream pricing service unavailable" },
            },
          },
        }
      }),
    ).rejects.toEqual({
      message: "Wrapped downstream failure",
      cause: {
        response: {
          status: "502",
          data: { message: "Upstream pricing service unavailable" },
        },
      },
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "positions_list",
        statusCode: 502,
        err: "Upstream pricing service unavailable",
      }),
    )
  })

  it("logs callable nested cause response status and message details", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/positions", { method: "GET" })
    await expect(
      withApiTelemetry(req, { name: "positions_list" }, async () => {
        throw {
          message: "Wrapped downstream failure",
          cause: () => ({
            response: () => ({
              status: () => "502",
              data: () => ({ message: () => "Callable upstream pricing service unavailable" }),
            }),
          }),
        }
      }),
    ).rejects.toEqual({
      message: "Wrapped downstream failure",
      cause: expect.any(Function),
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "positions_list",
        statusCode: 502,
        err: "Callable upstream pricing service unavailable",
      }),
    )
  })

  it("prefers http-client response data message in error logs", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/funds", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "funds_post" }, async () => {
        throw {
          name: "AxiosError",
          message: "Request failed with status code 400",
          response: { status: 400, data: { message: "Insufficient wallet balance" } },
        }
      }),
    ).rejects.toEqual({
      name: "AxiosError",
      message: "Request failed with status code 400",
      response: { status: 400, data: { message: "Insufficient wallet balance" } },
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "funds_post",
        statusCode: 400,
        errorName: "AxiosError",
        err: "Insufficient wallet balance",
      }),
    )
  })

  it("prefers callable response data message wrappers in error logs", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/funds", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "funds_post" }, async () => {
        throw {
          name: "AxiosError",
          message: "Request failed with status code 422",
          response: { status: 422, data: { message: () => "Callable wallet constraint" } },
        }
      }),
    ).rejects.toEqual({
      name: "AxiosError",
      message: "Request failed with status code 422",
      response: { status: 422, data: { message: expect.any(Function) } },
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "funds_post",
        statusCode: 422,
        errorName: "AxiosError",
        err: "Callable wallet constraint",
      }),
    )
  })

  it("extracts http-client error message from response data errors array", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "orders_post" }, async () => {
        throw {
          name: "AxiosError",
          message: "Request failed with status code 422",
          response: {
            status: 422,
            data: {
              errors: [{ message: "Order quantity exceeds risk cap" }],
            },
          },
        }
      }),
    ).rejects.toEqual({
      name: "AxiosError",
      message: "Request failed with status code 422",
      response: {
        status: 422,
        data: {
          errors: [{ message: "Order quantity exceeds risk cap" }],
        },
      },
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "orders_post",
        statusCode: 422,
        errorName: "AxiosError",
        err: "Order quantity exceeds risk cap",
      }),
    )
  })

  it("extracts http-client error message from nested response data error object", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "orders_post" }, async () => {
        throw {
          name: "AxiosError",
          message: "Request failed with status code 422",
          response: {
            status: 422,
            data: {
              error: { message: "Order price is outside allowed circuit" },
            },
          },
        }
      }),
    ).rejects.toEqual({
      name: "AxiosError",
      message: "Request failed with status code 422",
      response: {
        status: 422,
        data: {
          error: { message: "Order price is outside allowed circuit" },
        },
      },
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "orders_post",
        statusCode: 422,
        errorName: "AxiosError",
        err: "Order price is outside allowed circuit",
      }),
    )
  })

  it("falls back to nested cause message when top-level message is absent", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "orders_post" }, async () => {
        throw {
          cause: { message: "Order gateway unavailable" },
        }
      }),
    ).rejects.toEqual({
      cause: { message: "Order gateway unavailable" },
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "orders_post",
        err: "Order gateway unavailable",
      }),
    )
  })

  it("extracts http-client error message from nested response data wrapper object", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "orders_post" }, async () => {
        throw {
          name: "AxiosError",
          message: "Request failed with status code 422",
          response: {
            status: 422,
            data: {
              data: { message: "Trading is disabled for this symbol" },
            },
          },
        }
      }),
    ).rejects.toEqual({
      name: "AxiosError",
      message: "Request failed with status code 422",
      response: {
        status: 422,
        data: {
          data: { message: "Trading is disabled for this symbol" },
        },
      },
    })

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "orders_post",
        statusCode: 422,
        errorName: "AxiosError",
        err: "Trading is disabled for this symbol",
      }),
    )
  })

  it("parses relative request urls using fallback base", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "/relative-path",
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "relative_url_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/relative-path",
    })
    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "api_start",
        method: "GET",
        path: "/relative-path",
      }),
    )
  })

  it("parses URL-object request urls for pathname extraction", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: new URL("http://localhost/api/trading/url-object?debug=true"),
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_object_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/url-object",
    })
  })

  it("parses function-valued request urls for pathname extraction", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: () => "http://localhost/api/trading/url-function?debug=true",
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_function_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/url-function",
    })
  })

  it("parses Symbol.toPrimitive request urls for pathname extraction", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: {
        [Symbol.toPrimitive]: () => "http://localhost/api/trading/url-symbol?debug=true",
      },
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_symbol_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/url-symbol",
    })
  })

  it("parses URL-like pathname/search objects for pathname extraction", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: {
        pathname: "/api/trading/pathname-search",
        search: "trace=true",
      },
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_pathname_search_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/pathname-search",
    })
  })

  it("sanitizes URL-like pathname values that include query/hash fragments", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: {
        pathname: "/api/trading/pathname-with-query?trace=true#anchor",
        search: "userId=ignored-in-route",
      },
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_pathname_query_hash_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/pathname-with-query",
    })
  })

  it("parses URL-like pathname/search objects when search is URLSearchParams", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: {
        pathname: "/api/trading/pathname-search-object",
        search: new URLSearchParams("trace=true"),
      },
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_pathname_search_object_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/pathname-search-object",
    })
  })

  it("parses URL-like pathname/search objects when values are function-backed", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: {
        pathname: () => "/api/trading/pathname-search-function",
        search: () => "trace=true",
      },
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_pathname_search_function_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/pathname-search-function",
    })
  })

  it("parses URL-like objects with nested href values", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: {
        href: {
          href: "http://localhost/api/trading/url-nested-href?trace=true",
        },
      },
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_nested_href_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/url-nested-href",
    })
  })

  it("parses URL-like objects when href getter throws but toString is available", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: {
        get href() {
          throw new Error("href unavailable")
        },
        toString: () => "/api/trading/href-fallback?trace=true",
      },
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_object_href_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/href-fallback",
    })
  })

  it("parses whitespace-padded relative request urls using fallback base", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "  /relative-path?debug=true  ",
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "relative_trimmed_url_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/relative-path",
    })
  })

  it("uses nextUrl pathname when absolute and fallback parsing both fail", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: { pathname: "/api/trading/fallback" },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback",
    })
  })

  it("trims nextUrl pathname fallback when provided with surrounding spaces", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: { pathname: "  /api/trading/fallback-trimmed  " },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_trim_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-trimmed",
    })
  })

  it("uses function-valued nextUrl pathname fallback", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        pathname: () => " /api/trading/fallback-function-path ",
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_function_path_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-function-path",
    })
  })

  it("uses full-url nextUrl pathname fallback values", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        pathname: "http://localhost/api/trading/fallback-full-url-path?trace=true",
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_full_url_path_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-full-url-path",
    })
  })

  it("sanitizes nextUrl pathname fallback values containing query/hash", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        pathname: "/api/trading/fallback-path-query?trace=true#anchor",
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_path_query_hash_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-path-query",
    })
  })

  it("uses Symbol.toPrimitive nextUrl pathname fallback", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        pathname: {
          [Symbol.toPrimitive]: () => " /api/trading/fallback-symbol-path ",
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_symbol_path_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-symbol-path",
    })
  })

  it("ignores query-only nextUrl pathname fallback values", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        pathname: "?trace=true",
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_query_path_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/unknown",
    })
  })

  it("uses nextUrl pathname fallback when provided as toString object", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        pathname: {
          toString: () => " /api/trading/fallback-from-object ",
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_object_path_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-from-object",
    })
  })

  it("uses nextUrl href fallback when pathname is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        href: "http://localhost/api/trading/fallback-from-href?trace=true",
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_href_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-from-href",
    })
  })

  it("uses function-valued nextUrl href fallback when pathname is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        href: () => "http://localhost/api/trading/fallback-from-function-href?trace=true",
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_function_href_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-from-function-href",
    })
  })

  it("uses Symbol.toPrimitive nextUrl href fallback when pathname is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        href: {
          [Symbol.toPrimitive]: () => "http://localhost/api/trading/fallback-from-symbol-href?trace=true",
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_symbol_href_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-from-symbol-href",
    })
  })

  it("uses nested object nextUrl href fallback when pathname is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        href: {
          href: "http://localhost/api/trading/fallback-from-nested-href?trace=true",
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_nested_href_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-from-nested-href",
    })
  })

  it("uses nextUrl object toString fallback when pathname and href are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        toString: () => "http://localhost/api/trading/fallback-from-nexturl-object?trace=true",
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_object_url_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/fallback-from-nexturl-object",
    })
  })

  it("falls back to /unknown when neither url nor nextUrl is usable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      method: "GET",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "unknown_path_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/unknown",
    })
  })

  it("falls back to nextUrl pathname when request url getter throws", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      get url() {
        throw new Error("url unavailable")
      },
      method: "GET",
      headers: new Headers(),
      nextUrl: { pathname: "/api/trading/url-getter-fallback" },
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_getter_throw_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/url-getter-fallback",
    })
  })

  it("falls back to /unknown when nextUrl pathname getter throws", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      method: "GET",
      headers: new Headers(),
      nextUrl: {
        get pathname() {
          throw new Error("pathname unavailable")
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nexturl_pathname_throw_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/unknown",
    })
  })

  it("falls back to nextUrl pathname when URL-like toString throws", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: {
        toString: () => {
          throw new Error("url serialization failed")
        },
      },
      method: "GET",
      headers: new Headers(),
      nextUrl: { pathname: "/api/trading/to-string-fallback" },
    } as unknown as Request

    await withApiTelemetry(req, { name: "url_to_string_throw_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/to-string-fallback",
    })
  })

  it("falls back to empty headers object when request headers are missing", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
    } as unknown as Request

    await withApiTelemetry(req, { name: "missing_headers_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/funds",
    })
  })

  it("uses plain-object request headers maps", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        "x-request-id": "req-plain-map",
        "x-forwarded-for": "10.0.0.13",
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "plain_header_map_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-plain-map",
      ip: "10.0.0.13",
      route: "/api/trading/funds",
    })
  })

  it("uses callable plain-object request header maps", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: () => ({
        "x-request-id": "req-callable-map",
        "x-forwarded-for": "10.0.0.14",
      }),
    } as unknown as Request

    await withApiTelemetry(req, { name: "callable_plain_header_map_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-callable-map",
      ip: "10.0.0.14",
      route: "/api/trading/funds",
    })
  })

  it("falls back to empty headers object when request headers getter throws", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      get headers() {
        throw new Error("headers unavailable")
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "throwing_headers_property_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/funds",
    })
  })

  it("uses function-valued request headers objects", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: () =>
        new Headers({
          "x-request-id": "req-function-header",
          "x-forwarded-for": "10.0.0.7",
        }),
    } as unknown as Request

    await withApiTelemetry(req, { name: "function_headers_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-function-header",
      ip: "10.0.0.7",
      route: "/api/trading/funds",
    })
  })

  it("uses nested request headers wrappers when top-level get is absent", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        headers: new Headers({
          "x-request-id": "req-nested-header",
          "x-forwarded-for": "10.0.0.8",
        }),
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nested_headers_wrapper_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-nested-header",
      ip: "10.0.0.8",
      route: "/api/trading/funds",
    })
  })

  it("uses nested request headers plain-object wrappers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        headers: {
          "x-request-id": "req-nested-map",
          "x-forwarded-for": "10.0.0.15",
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "nested_headers_plain_map_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-nested-map",
      ip: "10.0.0.15",
      route: "/api/trading/funds",
    })
  })

  it("reads request headers from case-sensitive get implementations", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "X-Request-Id") {
            return "req-canonical-case-1000"
          }
          if (name === "X-Forwarded-For") {
            return "10.0.0.19"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "case_sensitive_header_get_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-canonical-case-1000",
      ip: "10.0.0.19",
      route: "/api/trading/funds",
    })
  })

  it("normalizes whitespace header values and drops empty request ids", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id") {
            return "   "
          }
          if (name === "x-forwarded-for") {
            return "   10.0.0.9   "
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "header_whitespace_normalization_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "10.0.0.9",
      route: "/api/trading/funds",
    })
  })

  it("normalizes comma-delimited request id values and skips placeholder tokens", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id") {
            return "unknown, 'req-actual-1000'"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.9"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "request_id_comma_normalization_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-actual-1000",
      ip: "10.0.0.9",
      route: "/api/trading/funds",
    })
  })

  it("ignores quoted comma fragments and NA-like placeholders in request id chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id") {
            return '"unknown,meta", na, req-actual-1001'
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.9"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "request_id_quoted_comma_chain_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-actual-1001",
      ip: "10.0.0.9",
      route: "/api/trading/funds",
    })
  })

  it("ignores serialized object artifacts in request id chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id") {
            return "[object Object], req-actual-1002"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.9"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "request_id_object_artifact_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-actual-1002",
      ip: "10.0.0.9",
      route: "/api/trading/funds",
    })
  })

  it("ignores function-like tokens in request id chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id") {
            return "function requestId() {}, req-actual-1003"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.9"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "request_id_function_artifact_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-actual-1003",
      ip: "10.0.0.9",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-correlation-id when x-request-id is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id") {
            return null
          }
          if (name === "x-correlation-id") {
            return "corr-1001"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.10"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "correlation_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "corr-1001",
      ip: "10.0.0.10",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-requestid when x-request-id is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id") {
            return null
          }
          if (name === "x-requestid") {
            return "req-compact-1000"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.9"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "compact_request_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-compact-1000",
      ip: "10.0.0.9",
      route: "/api/trading/funds",
    })
  })

  it("falls back to request-id when x-request-id and x-requestid are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id" || name === "x-requestid") {
            return null
          }
          if (name === "request-id") {
            return "req-canonical-1001"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.10"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "canonical_request_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-canonical-1001",
      ip: "10.0.0.10",
      route: "/api/trading/funds",
    })
  })

  it("falls back to requestid when x-request-id, x-requestid, and request-id are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id" || name === "x-requestid" || name === "request-id") {
            return null
          }
          if (name === "requestid") {
            return "req-compact-canonical-1001"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.18"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "compact_canonical_request_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-compact-canonical-1001",
      ip: "10.0.0.18",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-correlationid when request-id headers and x-correlation-id are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "requestid" ||
            name === "x-correlation-id"
          ) {
            return null
          }
          if (name === "x-correlationid") {
            return "corr-compact-1001"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.11"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "compact_correlation_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "corr-compact-1001",
      ip: "10.0.0.11",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-arr-log-id when request and correlation ids are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "x-correlation-id" ||
            name === "x-correlationid" ||
            name === "correlation-id"
          ) {
            return null
          }
          if (name === "x-arr-log-id") {
            return "2c5f9f0f-7b31-4f0d-83e4-2ae73f2f56c7"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.12"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "arr_log_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "2c5f9f0f-7b31-4f0d-83e4-2ae73f2f56c7",
      ip: "10.0.0.12",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-ms-request-id when request, correlation, and arr headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "x-correlation-id" ||
            name === "x-correlationid" ||
            name === "correlation-id" ||
            name === "x-arr-log-id"
          ) {
            return null
          }
          if (name === "x-ms-request-id") {
            return "b5f2d7c2-b947-4fe3-907a-f95f5eabce31"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.13"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "ms_request_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "b5f2d7c2-b947-4fe3-907a-f95f5eabce31",
      ip: "10.0.0.13",
      route: "/api/trading/funds",
    })
  })

  it("falls back to correlation-id when x-request-id and x-correlation-id are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id" || name === "x-requestid" || name === "request-id" || name === "x-correlation-id" || name === "x-correlationid") {
            return null
          }
          if (name === "correlation-id") {
            return "corr-1002"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.11"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "canonical_correlation_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "corr-1002",
      ip: "10.0.0.11",
      route: "/api/trading/funds",
    })
  })

  it("falls back to cloud trace context when request and correlation ids are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id" || name === "x-correlation-id" || name === "correlation-id") {
            return null
          }
          if (name === "x-cloud-trace-context") {
            return "105445aa7843bc8bf206b120001000/1;o=1"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.12"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "cloud_trace_context_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "105445aa7843bc8bf206b120001000/1;o=1",
      ip: "10.0.0.12",
      route: "/api/trading/funds",
    })
  })

  it("falls back to cf-ray when cloud trace context is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "x-correlation-id" ||
            name === "x-correlationid" ||
            name === "correlation-id" ||
            name === "x-arr-log-id" ||
            name === "x-ms-request-id" ||
            name === "x-cloud-trace-context"
          ) {
            return null
          }
          if (name === "cf-ray") {
            return "7b4f9e5a8f2b1234-SIN"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.14"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "cf_ray_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "7b4f9e5a8f2b1234-SIN",
      ip: "10.0.0.14",
      route: "/api/trading/funds",
    })
  })

  it("falls back to mixed-case cf-ray when header getter is case-sensitive", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "x-correlation-id" ||
            name === "x-correlationid" ||
            name === "correlation-id" ||
            name === "x-arr-log-id" ||
            name === "x-ms-request-id" ||
            name === "x-cloud-trace-context"
          ) {
            return null
          }
          if (name === "Cf-Ray") {
            return "7b4f9e5a8f2b5678-BOM"
          }
          if (name === "X-Forwarded-For") {
            return "10.0.0.25"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "cf_ray_mixed_case_header_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "7b4f9e5a8f2b5678-BOM",
      ip: "10.0.0.25",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-amz-cf-id when cloud trace context and cf-ray are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "x-correlation-id" ||
            name === "x-correlationid" ||
            name === "correlation-id" ||
            name === "x-arr-log-id" ||
            name === "x-ms-request-id" ||
            name === "x-cloud-trace-context" ||
            name === "cf-ray"
          ) {
            return null
          }
          if (name === "x-amz-cf-id") {
            return "1Q2w3E4r5T6y7U8i9O0p=="
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.17"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "cloudfront_request_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "1Q2w3E4r5T6y7U8i9O0p==",
      ip: "10.0.0.17",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-amzn-requestid when cloud trace context, cf-ray, and x-amz-cf-id are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "x-correlation-id" ||
            name === "x-correlationid" ||
            name === "correlation-id" ||
            name === "x-arr-log-id" ||
            name === "x-ms-request-id" ||
            name === "x-cloud-trace-context" ||
            name === "cf-ray" ||
            name === "x-amz-cf-id"
          ) {
            return null
          }
          if (name === "x-amzn-requestid") {
            return "req-aws-gateway-1001"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.14"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "amzn_requestid_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-aws-gateway-1001",
      ip: "10.0.0.14",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-amzn-trace-id when cloud trace context, cf-ray, x-amz-cf-id, and x-amzn-requestid are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-correlation-id" ||
            name === "correlation-id" ||
            name === "x-cloud-trace-context" ||
            name === "cf-ray" ||
            name === "x-amz-cf-id" ||
            name === "x-amzn-requestid"
          ) {
            return null
          }
          if (name === "x-amzn-trace-id") {
            return "Root=1-67891233-abcdef012345678912345678"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.14"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "amzn_trace_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "Root=1-67891233-abcdef012345678912345678",
      ip: "10.0.0.14",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-b3-traceid when cloud and amazon trace headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-correlation-id" ||
            name === "correlation-id" ||
            name === "x-cloud-trace-context" ||
            name === "x-amzn-requestid" ||
            name === "x-amzn-trace-id"
          ) {
            return null
          }
          if (name === "x-b3-traceid") {
            return "4bf92f3577b34da6a3ce929d0e0e4736"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.15"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "b3_trace_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "4bf92f3577b34da6a3ce929d0e0e4736",
      ip: "10.0.0.15",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-datadog-trace-id when b3 trace id is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "x-correlation-id" ||
            name === "x-correlationid" ||
            name === "correlation-id" ||
            name === "x-arr-log-id" ||
            name === "x-ms-request-id" ||
            name === "x-cloud-trace-context" ||
            name === "cf-ray" ||
            name === "x-amz-cf-id" ||
            name === "x-amzn-requestid" ||
            name === "x-amzn-trace-id" ||
            name === "x-b3-traceid"
          ) {
            return null
          }
          if (name === "x-datadog-trace-id") {
            return "8967543210987654321"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.16"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "datadog_trace_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "8967543210987654321",
      ip: "10.0.0.16",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-trace-id when b3 and datadog trace ids are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "x-correlation-id" ||
            name === "x-correlationid" ||
            name === "correlation-id" ||
            name === "x-arr-log-id" ||
            name === "x-ms-request-id" ||
            name === "x-cloud-trace-context" ||
            name === "cf-ray" ||
            name === "x-amz-cf-id" ||
            name === "x-amzn-requestid" ||
            name === "x-amzn-trace-id" ||
            name === "x-b3-traceid" ||
            name === "x-datadog-trace-id"
          ) {
            return null
          }
          if (name === "x-trace-id") {
            return "trace-tenant-1001"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.16"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_trace_id_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "trace-tenant-1001",
      ip: "10.0.0.16",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-ot-span-context when x-trace-id is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "requestid" ||
            name === "x-correlation-id" ||
            name === "x-correlationid" ||
            name === "correlation-id" ||
            name === "x-arr-log-id" ||
            name === "x-ms-request-id" ||
            name === "x-cloud-trace-context" ||
            name === "cf-ray" ||
            name === "x-amz-cf-id" ||
            name === "x-amzn-requestid" ||
            name === "x-amzn-trace-id" ||
            name === "x-b3-traceid" ||
            name === "x-datadog-trace-id" ||
            name === "x-trace-id"
          ) {
            return null
          }
          if (name === "x-ot-span-context") {
            return "4bf92f3577b34da6a3ce929d0e0e4736/00f067aa0ba902b7;o=1"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.17"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "ot_span_context_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "4bf92f3577b34da6a3ce929d0e0e4736/00f067aa0ba902b7;o=1",
      ip: "10.0.0.17",
      route: "/api/trading/funds",
    })
  })

  it("falls back to traceparent when request-id, correlation, and vendor trace headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-request-id" ||
            name === "x-requestid" ||
            name === "request-id" ||
            name === "requestid" ||
            name === "x-correlation-id" ||
            name === "x-correlationid" ||
            name === "correlation-id" ||
            name === "x-arr-log-id" ||
            name === "x-ms-request-id" ||
            name === "x-cloud-trace-context" ||
            name === "cf-ray" ||
            name === "x-amz-cf-id" ||
            name === "x-amzn-requestid" ||
            name === "x-amzn-trace-id" ||
            name === "x-b3-traceid" ||
            name === "x-datadog-trace-id" ||
            name === "x-trace-id" ||
            name === "x-ot-span-context"
          ) {
            return null
          }
          if (name === "traceparent") {
            return "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.16"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "traceparent_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
      ip: "10.0.0.16",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-request-id over all request-id fallback headers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-request-id") {
            return "req-primary-1003"
          }
          if (name === "x-requestid") {
            return "req-compact-1003"
          }
          if (name === "request-id") {
            return "req-canonical-1003"
          }
          if (name === "requestid") {
            return "req-compact-canonical-1003"
          }
          if (name === "x-correlation-id") {
            return "corr-1003"
          }
          if (name === "x-correlationid") {
            return "corr-compact-1003"
          }
          if (name === "x-arr-log-id") {
            return "2c5f9f0f-7b31-4f0d-83e4-2ae73f2f56c8"
          }
          if (name === "x-ms-request-id") {
            return "b5f2d7c2-b947-4fe3-907a-f95f5eabce32"
          }
          if (name === "correlation-id") {
            return "corr-1004"
          }
          if (name === "x-cloud-trace-context") {
            return "trace-cloud-1005/1;o=1"
          }
          if (name === "cf-ray") {
            return "7b4f9e5a8f2b1234-SIN"
          }
          if (name === "x-amz-cf-id") {
            return "1Q2w3E4r5T6y7U8i9O0p=="
          }
          if (name === "x-amzn-requestid") {
            return "req-aws-gateway-1002"
          }
          if (name === "x-amzn-trace-id") {
            return "Root=1-67891233-abcdef012345678912345678"
          }
          if (name === "x-b3-traceid") {
            return "4bf92f3577b34da6a3ce929d0e0e4736"
          }
          if (name === "x-datadog-trace-id") {
            return "8967543210987654322"
          }
          if (name === "x-trace-id") {
            return "trace-tenant-1003"
          }
          if (name === "x-ot-span-context") {
            return "4bf92f3577b34da6a3ce929d0e0e4736/00f067aa0ba902b7;o=1"
          }
          if (name === "traceparent") {
            return "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00"
          }
          if (name === "x-forwarded-for") {
            return "10.0.0.13"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "request_id_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: "req-primary-1003",
      ip: "10.0.0.13",
      route: "/api/trading/funds",
    })
  })

  it("normalizes x-forwarded-for to first non-empty client ip", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "  , 10.0.0.10 , 172.16.0.2 "
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_normalization_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "10.0.0.10",
      route: "/api/trading/funds",
    })
  })

  it("normalizes x-forwarded-for host:port entries to host", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "198.51.100.30:4711, 10.0.0.20"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_host_port_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.30",
      route: "/api/trading/funds",
    })
  })

  it("normalizes single-quoted x-forwarded-for entries", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "'198.51.100.69:443', 203.0.113.69"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_single_quoted_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.69",
      route: "/api/trading/funds",
    })
  })

  it("normalizes nested-quoted x-forwarded-for entries", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "\"'198.51.100.111:443'\", 203.0.113.111"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_nested_quoted_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.111",
      route: "/api/trading/funds",
    })
  })

  it("ignores quoted comma payloads in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return '"198.51.100.80,proxy-note", 203.0.113.80'
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_quoted_comma_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.80",
      route: "/api/trading/funds",
    })
  })

  it("skips invalid function-like tokens in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "function fakeClient() {}, 198.51.100.31"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_invalid_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.31",
      route: "/api/trading/funds",
    })
  })

  it("normalizes x-forwarded-for bracketed ipv6 entries with ports", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "[2001:db8::17]:4711, 10.0.0.21"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_ipv6_port_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "2001:db8::17",
      route: "/api/trading/funds",
    })
  })

  it("ignores unknown placeholders in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "unknown, 203.0.113.45"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_unknown_chain_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.45",
      route: "/api/trading/funds",
    })
  })

  it("ignores null placeholders in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "null, 203.0.113.49"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_null_chain_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.49",
      route: "/api/trading/funds",
    })
  })

  it("ignores scheme-like tokens in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "https://proxy.internal, 203.0.113.50"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_scheme_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.50",
      route: "/api/trading/funds",
    })
  })

  it("ignores non-numeric host:port tokens in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "proxy-node:edge, 203.0.113.55"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_non_numeric_port_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.55",
      route: "/api/trading/funds",
    })
  })

  it("ignores out-of-range numeric host:port tokens in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "203.0.113.61:70000, 203.0.113.62"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_out_of_range_port_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.62",
      route: "/api/trading/funds",
    })
  })

  it("ignores hostname tokens in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "proxy.internal, 203.0.113.57"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_hostname_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.57",
      route: "/api/trading/funds",
    })
  })

  it("ignores numeric non-IP tokens in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "12345, 203.0.113.59"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_numeric_non_ip_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.59",
      route: "/api/trading/funds",
    })
  })

  it("ignores unspecified ipv4 placeholders in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "0.0.0.0, 203.0.113.64"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_unspecified_ipv4_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.64",
      route: "/api/trading/funds",
    })
  })

  it("ignores slash-containing tokens in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "198.51.100.0/24, 203.0.113.51"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_slash_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.51",
      route: "/api/trading/funds",
    })
  })

  it("ignores unknown host:port placeholders in x-forwarded-for chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "unknown:4711, 203.0.113.46"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_for_unknown_port_chain_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.46",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-real-ip when x-forwarded-for is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "x-real-ip") {
            return " 10.0.0.11 "
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "real_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "10.0.0.11",
      route: "/api/trading/funds",
    })
  })

  it("falls back to cf-connecting-ip when forwarded and real-ip headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for" || name === "forwarded" || name === "x-real-ip") {
            return null
          }
          if (name === "cf-connecting-ip") {
            return " 203.0.113.44 "
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "cf_connecting_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "203.0.113.44",
      route: "/api/trading/funds",
    })
  })

  it("falls back to cloudfront-viewer-address when earlier proxy headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip"
          ) {
            return null
          }
          if (name === "cloudfront-viewer-address") {
            return "198.51.100.105:443"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "cloudfront_viewer_address_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.105",
      route: "/api/trading/funds",
    })
  })

  it("falls back to cf-connecting-ipv6 when cf-connecting-ip and earlier proxy headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip"
          ) {
            return null
          }
          if (name === "cf-connecting-ipv6") {
            return " 2001:db8::44 "
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "cf_connecting_ipv6_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "2001:db8::44",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-azure-clientip when cloudfront and earlier proxy headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cloudfront-viewer-address"
          ) {
            return null
          }
          if (name === "x-azure-clientip") {
            return "198.51.100.114"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "azure_client_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.114",
      route: "/api/trading/funds",
    })
  })

  it("falls back to fastly-client-ip when earlier proxy headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for" || name === "x-original-forwarded-for" || name === "forwarded" || name === "x-real-ip" || name === "cf-connecting-ip") {
            return null
          }
          if (name === "fastly-client-ip") {
            return "198.51.100.90"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "fastly_client_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.90",
      route: "/api/trading/funds",
    })
  })

  it("falls back to fly-client-ip when earlier proxy headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "fastly-client-ip"
          ) {
            return null
          }
          if (name === "fly-client-ip") {
            return "198.51.100.96"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "fly_client_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.96",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-envoy-external-address when earlier proxy headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for" || name === "forwarded" || name === "x-real-ip" || name === "cf-connecting-ip") {
            return null
          }
          if (name === "x-envoy-external-address") {
            return "198.51.100.71"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "envoy_external_address_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.71",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-client-ip when no preferred proxy ip headers are available", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for" || name === "forwarded" || name === "x-real-ip" || name === "cf-connecting-ip") {
            return null
          }
          if (name === "x-client-ip") {
            return "198.51.100.25"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_client_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.25",
      route: "/api/trading/funds",
    })
  })

  it("falls back to true-client-ip when higher-priority proxy headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip"
          ) {
            return null
          }
          if (name === "true-client-ip") {
            return "198.51.100.66"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "true_client_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.66",
      route: "/api/trading/funds",
    })
  })

  it("prefers true-client-ip over x-client-ip when both are available", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip"
          ) {
            return null
          }
          if (name === "true-client-ip") {
            return "198.51.100.67"
          }
          if (name === "x-client-ip") {
            return "198.51.100.68"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "true_client_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.67",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-true-client-ip when true-client-ip is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-forwarded-client-ip" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip" ||
            name === "x-forwarded" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cf-connecting-ipv6" ||
            name === "cloudfront-viewer-address" ||
            name === "x-azure-clientip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip"
          ) {
            return null
          }
          if (name === "x-true-client-ip") {
            return "198.51.100.69"
          }
          if (name === "x-cluster-client-ip") {
            return "198.51.100.70"
          }
          if (name === "x-client-ip") {
            return "198.51.100.71"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_true_client_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.69",
      route: "/api/trading/funds",
    })
  })

  it("prefers true-client-ip over x-true-client-ip when both are available", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-forwarded-client-ip" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip" ||
            name === "x-forwarded" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cf-connecting-ipv6" ||
            name === "cloudfront-viewer-address" ||
            name === "x-azure-clientip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address"
          ) {
            return null
          }
          if (name === "true-client-ip") {
            return "198.51.100.72"
          }
          if (name === "x-true-client-ip") {
            return "198.51.100.73"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_true_client_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.72",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-cluster-client-ip when higher-priority proxy headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip"
          ) {
            return null
          }
          if (name === "x-cluster-client-ip") {
            return "198.51.100.75"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_cluster_client_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.75",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-cluster-client-ip over x-client-ip when both are available", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip"
          ) {
            return null
          }
          if (name === "x-cluster-client-ip") {
            return "198.51.100.76"
          }
          if (name === "x-client-ip") {
            return "198.51.100.77"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_cluster_client_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.76",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-appengine-user-ip when higher-priority headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip" ||
            name === "x-cluster-client-ip"
          ) {
            return null
          }
          if (name === "x-appengine-user-ip") {
            return "198.51.100.102"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "appengine_user_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.102",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-appengine-user-ip over x-client-ip when both are available", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip" ||
            name === "x-cluster-client-ip"
          ) {
            return null
          }
          if (name === "x-appengine-user-ip") {
            return "198.51.100.103"
          }
          if (name === "x-client-ip") {
            return "198.51.100.104"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "appengine_user_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.103",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-clientip when higher-priority headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-forwarded-client-ip" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip" ||
            name === "x-forwarded" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cf-connecting-ipv6" ||
            name === "cloudfront-viewer-address" ||
            name === "x-azure-clientip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip" ||
            name === "x-cluster-client-ip" ||
            name === "x-appengine-user-ip"
          ) {
            return null
          }
          if (name === "x-clientip") {
            return "198.51.100.170"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_clientip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.170",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-clientip over client-ip and x-client-ip", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-forwarded-client-ip" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip" ||
            name === "x-forwarded" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cf-connecting-ipv6" ||
            name === "cloudfront-viewer-address" ||
            name === "x-azure-clientip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip" ||
            name === "x-cluster-client-ip" ||
            name === "x-appengine-user-ip"
          ) {
            return null
          }
          if (name === "x-clientip") {
            return "198.51.100.171"
          }
          if (name === "client-ip") {
            return "198.51.100.172"
          }
          if (name === "x-client-ip") {
            return "198.51.100.173"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_clientip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.171",
      route: "/api/trading/funds",
    })
  })

  it("falls back to client-ip when higher-priority headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cf-connecting-ipv6" ||
            name === "cloudfront-viewer-address" ||
            name === "x-azure-clientip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip" ||
            name === "x-cluster-client-ip" ||
            name === "x-appengine-user-ip"
          ) {
            return null
          }
          if (name === "client-ip") {
            return "198.51.100.149"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "client_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.149",
      route: "/api/trading/funds",
    })
  })

  it("prefers client-ip over x-client-ip when both are available", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cf-connecting-ipv6" ||
            name === "cloudfront-viewer-address" ||
            name === "x-azure-clientip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip" ||
            name === "x-cluster-client-ip" ||
            name === "x-appengine-user-ip"
          ) {
            return null
          }
          if (name === "client-ip") {
            return "198.51.100.150"
          }
          if (name === "x-client-ip") {
            return "198.51.100.151"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "client_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.150",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-remote-ip when client-ip and x-client-ip are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-forwarded-client-ip" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip" ||
            name === "x-forwarded" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cf-connecting-ipv6" ||
            name === "cloudfront-viewer-address" ||
            name === "x-azure-clientip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip" ||
            name === "x-cluster-client-ip" ||
            name === "x-appengine-user-ip" ||
            name === "client-ip" ||
            name === "x-client-ip"
          ) {
            return null
          }
          if (name === "x-remote-ip") {
            return "198.51.100.166"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_remote_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.166",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-remote-ip over remote-addr when both are available", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-forwarded-client-ip" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip" ||
            name === "x-forwarded" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cf-connecting-ipv6" ||
            name === "cloudfront-viewer-address" ||
            name === "x-azure-clientip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip" ||
            name === "x-cluster-client-ip" ||
            name === "x-appengine-user-ip" ||
            name === "client-ip" ||
            name === "x-client-ip"
          ) {
            return null
          }
          if (name === "x-remote-ip") {
            return "198.51.100.167"
          }
          if (name === "remote-addr") {
            return "198.51.100.168"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_remote_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.167",
      route: "/api/trading/funds",
    })
  })

  it("falls back to remote-addr when x-remote-ip is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-forwarded-client-ip" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip" ||
            name === "x-forwarded" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cf-connecting-ipv6" ||
            name === "cloudfront-viewer-address" ||
            name === "x-azure-clientip" ||
            name === "fastly-client-ip" ||
            name === "fly-client-ip" ||
            name === "x-envoy-external-address" ||
            name === "true-client-ip" ||
            name === "x-cluster-client-ip" ||
            name === "x-appengine-user-ip" ||
            name === "client-ip" ||
            name === "x-client-ip" ||
            name === "x-remote-ip"
          ) {
            return null
          }
          if (name === "remote-addr") {
            return "198.51.100.169"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "remote_addr_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.169",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-envoy-external-address over true-client-ip and x-client-ip", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip"
          ) {
            return null
          }
          if (name === "x-envoy-external-address") {
            return "198.51.100.72"
          }
          if (name === "true-client-ip") {
            return "198.51.100.73"
          }
          if (name === "x-client-ip") {
            return "198.51.100.74"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "envoy_external_address_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.72",
      route: "/api/trading/funds",
    })
  })

  it("prefers fastly-client-ip over envoy and downstream client-ip headers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip"
          ) {
            return null
          }
          if (name === "fastly-client-ip") {
            return "198.51.100.91"
          }
          if (name === "x-envoy-external-address") {
            return "198.51.100.92"
          }
          if (name === "true-client-ip") {
            return "198.51.100.93"
          }
          if (name === "x-cluster-client-ip") {
            return "198.51.100.94"
          }
          if (name === "x-client-ip") {
            return "198.51.100.95"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "fastly_client_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.91",
      route: "/api/trading/funds",
    })
  })

  it("prefers fly-client-ip over envoy and downstream client-ip headers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "fastly-client-ip"
          ) {
            return null
          }
          if (name === "fly-client-ip") {
            return "198.51.100.97"
          }
          if (name === "x-envoy-external-address") {
            return "198.51.100.98"
          }
          if (name === "true-client-ip") {
            return "198.51.100.99"
          }
          if (name === "x-cluster-client-ip") {
            return "198.51.100.100"
          }
          if (name === "x-client-ip") {
            return "198.51.100.101"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "fly_client_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.97",
      route: "/api/trading/funds",
    })
  })

  it("prefers cloudfront-viewer-address over fastly/fly/envoy and downstream client-ip headers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip"
          ) {
            return null
          }
          if (name === "cloudfront-viewer-address") {
            return "198.51.100.106:443"
          }
          if (name === "fastly-client-ip") {
            return "198.51.100.107"
          }
          if (name === "fly-client-ip") {
            return "198.51.100.108"
          }
          if (name === "x-envoy-external-address") {
            return "198.51.100.109"
          }
          if (name === "true-client-ip") {
            return "198.51.100.110"
          }
          if (name === "x-cluster-client-ip") {
            return "198.51.100.111"
          }
          if (name === "x-appengine-user-ip") {
            return "198.51.100.112"
          }
          if (name === "x-client-ip") {
            return "198.51.100.113"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "cloudfront_viewer_address_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.106",
      route: "/api/trading/funds",
    })
  })

  it("prefers cf-connecting-ipv6 over cloudfront and downstream proxy headers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip"
          ) {
            return null
          }
          if (name === "cf-connecting-ipv6") {
            return "2001:db8::45"
          }
          if (name === "cloudfront-viewer-address") {
            return "198.51.100.131:443"
          }
          if (name === "x-azure-clientip") {
            return "198.51.100.132"
          }
          if (name === "fastly-client-ip") {
            return "198.51.100.133"
          }
          if (name === "fly-client-ip") {
            return "198.51.100.134"
          }
          if (name === "x-envoy-external-address") {
            return "198.51.100.135"
          }
          if (name === "true-client-ip") {
            return "198.51.100.136"
          }
          if (name === "x-cluster-client-ip") {
            return "198.51.100.137"
          }
          if (name === "x-appengine-user-ip") {
            return "198.51.100.138"
          }
          if (name === "x-client-ip") {
            return "198.51.100.139"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "cf_connecting_ipv6_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "2001:db8::45",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-azure-clientip over fastly/fly/envoy and downstream client-ip headers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "forwarded" ||
            name === "x-real-ip" ||
            name === "cf-connecting-ip" ||
            name === "cloudfront-viewer-address"
          ) {
            return null
          }
          if (name === "x-azure-clientip") {
            return "198.51.100.115"
          }
          if (name === "fastly-client-ip") {
            return "198.51.100.116"
          }
          if (name === "fly-client-ip") {
            return "198.51.100.117"
          }
          if (name === "x-envoy-external-address") {
            return "198.51.100.118"
          }
          if (name === "true-client-ip") {
            return "198.51.100.119"
          }
          if (name === "x-cluster-client-ip") {
            return "198.51.100.120"
          }
          if (name === "x-appengine-user-ip") {
            return "198.51.100.121"
          }
          if (name === "x-client-ip") {
            return "198.51.100.122"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "azure_client_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.115",
      route: "/api/trading/funds",
    })
  })

  it("falls back to Forwarded header when x-forwarded-for is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return 'for=unknown, for="198.51.100.17:4711";proto=https'
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_header_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.17",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-original-forwarded-for when x-forwarded-for is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "x-original-forwarded-for") {
            return "198.51.100.86, 10.0.0.20"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "original_forwarded_for_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.86",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-forwarded-client-ip when x-forwarded-for is unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "x-forwarded-client-ip") {
            return "198.51.100.159"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_client_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.159",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-forwarded-client-ip over x-original-forwarded-for and downstream proxy headers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "x-forwarded-client-ip") {
            return "198.51.100.160"
          }
          if (name === "x-original-forwarded-for") {
            return "198.51.100.161"
          }
          if (name === "x-vercel-forwarded-for") {
            return "198.51.100.162"
          }
          if (name === "x-nf-client-connection-ip") {
            return "198.51.100.163"
          }
          if (name === "forwarded") {
            return "for=198.51.100.164"
          }
          if (name === "x-real-ip") {
            return "198.51.100.165"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_client_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.160",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-vercel-forwarded-for when x-forwarded-for and x-original-forwarded-for are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for" || name === "x-original-forwarded-for") {
            return null
          }
          if (name === "x-vercel-forwarded-for") {
            return "198.51.100.123, 10.0.0.30"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "vercel_forwarded_for_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.123",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-vercel-forwarded-for over Forwarded and downstream proxy headers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for" || name === "x-original-forwarded-for") {
            return null
          }
          if (name === "x-vercel-forwarded-for") {
            return "198.51.100.124"
          }
          if (name === "forwarded") {
            return "for=198.51.100.125"
          }
          if (name === "x-real-ip") {
            return "198.51.100.126"
          }
          if (name === "cf-connecting-ip") {
            return "198.51.100.127"
          }
          if (name === "cloudfront-viewer-address") {
            return "198.51.100.128:443"
          }
          if (name === "x-azure-clientip") {
            return "198.51.100.129"
          }
          if (name === "x-client-ip") {
            return "198.51.100.130"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "vercel_forwarded_for_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.124",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-nf-client-connection-ip when x-forwarded-for, x-original-forwarded-for, and x-vercel-forwarded-for are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for"
          ) {
            return null
          }
          if (name === "x-nf-client-connection-ip") {
            return "198.51.100.140"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "netlify_client_ip_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.140",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-nf-client-connection-ip over Forwarded and downstream proxy headers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for"
          ) {
            return null
          }
          if (name === "x-nf-client-connection-ip") {
            return "198.51.100.141"
          }
          if (name === "forwarded") {
            return "for=198.51.100.142"
          }
          if (name === "x-real-ip") {
            return "198.51.100.143"
          }
          if (name === "cf-connecting-ip") {
            return "198.51.100.144"
          }
          if (name === "cf-connecting-ipv6") {
            return "2001:db8::145"
          }
          if (name === "cloudfront-viewer-address") {
            return "198.51.100.146:443"
          }
          if (name === "x-azure-clientip") {
            return "198.51.100.147"
          }
          if (name === "x-client-ip") {
            return "198.51.100.148"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "netlify_client_ip_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.141",
      route: "/api/trading/funds",
    })
  })

  it("falls back to x-forwarded when x-forwarded-for family headers are unavailable", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip"
          ) {
            return null
          }
          if (name === "x-forwarded") {
            return "for=198.51.100.152;proto=https"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_forwarded_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.152",
      route: "/api/trading/funds",
    })
  })

  it("falls back to raw x-forwarded chains when for= pairs are absent", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip"
          ) {
            return null
          }
          if (name === "x-forwarded") {
            return "unknown, 198.51.100.158"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_forwarded_raw_chain_fallback_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.158",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-forwarded over Forwarded and downstream proxy headers", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (
            name === "x-forwarded-for" ||
            name === "x-original-forwarded-for" ||
            name === "x-vercel-forwarded-for" ||
            name === "x-nf-client-connection-ip"
          ) {
            return null
          }
          if (name === "x-forwarded") {
            return "for=198.51.100.153;proto=https"
          }
          if (name === "forwarded") {
            return "for=198.51.100.154"
          }
          if (name === "x-real-ip") {
            return "198.51.100.155"
          }
          if (name === "cf-connecting-ip") {
            return "198.51.100.156"
          }
          if (name === "x-client-ip") {
            return "198.51.100.157"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "x_forwarded_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.153",
      route: "/api/trading/funds",
    })
  })

  it("parses single-quoted Forwarded header tokens", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for='198.51.100.70:443';proto=https"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_single_quoted_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.70",
      route: "/api/trading/funds",
    })
  })

  it("parses nested-quoted Forwarded header tokens", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return 'for="\'198.51.100.112:443\'";proto=https'
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_nested_quoted_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.112",
      route: "/api/trading/funds",
    })
  })

  it("ignores quoted semicolon payloads in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return 'for="198.51.100.81;proxy-note";proto=https, for=198.51.100.82'
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_quoted_semicolon_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.82",
      route: "/api/trading/funds",
    })
  })

  it("ignores quoted comma payloads in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return 'for="198.51.100.83,proxy-note";proto=https, for=198.51.100.84'
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_quoted_comma_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.84",
      route: "/api/trading/funds",
    })
  })

  it("ignores unknown host:port placeholders in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for=unknown:4711, for=198.51.100.47"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_unknown_port_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.47",
      route: "/api/trading/funds",
    })
  })

  it("ignores undefined placeholders in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for=undefined, for=198.51.100.52"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_undefined_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.52",
      route: "/api/trading/funds",
    })
  })

  it("ignores scheme-like tokens in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for=https://proxy.internal, for=198.51.100.53"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_scheme_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.53",
      route: "/api/trading/funds",
    })
  })

  it("ignores non-numeric host:port tokens in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for=proxy-node:edge, for=198.51.100.56"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_non_numeric_port_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.56",
      route: "/api/trading/funds",
    })
  })

  it("ignores out-of-range numeric host:port tokens in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for=\"[2001:db8::77]:70000\", for=198.51.100.63"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_out_of_range_port_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.63",
      route: "/api/trading/funds",
    })
  })

  it("ignores hostname tokens in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for=proxy.internal, for=198.51.100.58"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_hostname_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.58",
      route: "/api/trading/funds",
    })
  })

  it("ignores numeric non-IP tokens in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for=12345, for=198.51.100.60"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_numeric_non_ip_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.60",
      route: "/api/trading/funds",
    })
  })

  it("ignores unspecified ipv6 placeholders in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return 'for="[::]", for=198.51.100.65'
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_unspecified_ipv6_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.65",
      route: "/api/trading/funds",
    })
  })

  it("ignores slash-containing tokens in Forwarded header chains", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for=198.51.100.0/24, for=198.51.100.54"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_slash_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.54",
      route: "/api/trading/funds",
    })
  })

  it("parses Forwarded header tokens with whitespace around equals", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for = unknown ; proto=https, for = 198.51.100.48"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_whitespace_equals_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.48",
      route: "/api/trading/funds",
    })
  })

  it("ignores obfuscated Forwarded identifiers and selects next valid token", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for=_hidden, for=198.51.100.18"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_obfuscated_identifier_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.18",
      route: "/api/trading/funds",
    })
  })

  it("ignores invalid function-like Forwarded identifiers and selects next valid token", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return null
          }
          if (name === "forwarded") {
            return "for=function fakeClient() {}, for=198.51.100.40"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_invalid_token_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.40",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-forwarded-for over Forwarded header values", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "10.0.0.12, 172.16.0.3"
          }
          if (name === "forwarded") {
            return "for=198.51.100.19"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "forwarded_header_priority_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "10.0.0.12",
      route: "/api/trading/funds",
    })
  })

  it("prefers x-forwarded-for over x-original-forwarded-for values", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-for") {
            return "198.51.100.87, 10.0.0.22"
          }
          if (name === "x-original-forwarded-for") {
            return "198.51.100.88"
          }
          return null
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "original_forwarded_for_precedence_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: "198.51.100.87",
      route: "/api/trading/funds",
    })
  })

  it("continues when request header getter throws", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/funds",
      method: "POST",
      headers: {
        get: () => {
          throw new Error("broken headers getter")
        },
      },
    } as unknown as Request

    await withApiTelemetry(req, { name: "throwing_headers_case" }, async () => ({ ok: true }))

    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: undefined,
      route: "/api/trading/funds",
    })
  })

  it("continues when request logger factory throws", async () => {
    withRequestMock.mockImplementation(() => {
      throw new Error("logger unavailable")
    })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    const response = await withApiTelemetry(req, { name: "logger_factory_throw_case" }, async () => ({ ok: true }))

    expect(response.result).toEqual({ ok: true })
    expect(withRequestMock).toHaveBeenCalledWith({
      requestId: undefined,
      ip: null,
      route: "/api/trading/orders",
    })
  })

  it("uses available info logger when error logger is missing", async () => {
    const info = jest.fn()
    withRequestMock.mockReturnValue({ info })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "partial_logger_error_missing_case" }, async () => {
        throw new Error("handler failure with partial logger")
      }),
    ).rejects.toThrow("handler failure with partial logger")

    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "api_start",
        name: "partial_logger_error_missing_case",
      }),
    )
  })

  it("uses available error logger when info logger is missing", async () => {
    const error = jest.fn()
    withRequestMock.mockReturnValue({ error })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    const response = await withApiTelemetry(req, { name: "partial_logger_info_missing_case" }, async () => ({ ok: true }))

    expect(response.result).toEqual({ ok: true })
    expect(error).not.toHaveBeenCalled()
  })

  it("continues when logger info sinks throw", async () => {
    const info = jest.fn(() => {
      throw new Error("logger sink unavailable")
    })
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    const response = await withApiTelemetry(req, { name: "logger_info_throw_case" }, async () => ({ ok: true }))

    expect(response.result).toEqual({ ok: true })
    expect(info).toHaveBeenCalled()
  })

  it("rethrows handler errors even when logger error sink throws", async () => {
    const info = jest.fn()
    const error = jest.fn(() => {
      throw new Error("logger sink unavailable")
    })
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "logger_error_throw_case" }, async () => {
        throw new Error("original handler failure")
      }),
    ).rejects.toThrow("original handler failure")
  })

  it("falls back request method to UNKNOWN when missing", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/orders",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "missing_method_case" }, async () => ({ ok: true }))

    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "api_start",
        method: "UNKNOWN",
      }),
    )
  })

  it("falls back request method to UNKNOWN when getter throws", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/orders",
      get method() {
        throw new Error("method unavailable")
      },
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "throwing_method_case" }, async () => ({ ok: true }))

    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "api_start",
        method: "UNKNOWN",
      }),
    )
  })

  it("normalizes lowercase request methods to uppercase", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/orders",
      method: "post",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "method_normalization_case" }, async () => ({ ok: true }))

    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "api_start",
        method: "POST",
      }),
    )
  })

  it("normalizes function-valued request methods to uppercase", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/orders",
      method: () => " patch ",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "method_function_normalization_case" }, async () => ({ ok: true }))

    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "api_start",
        method: "PATCH",
      }),
    )
  })

  it("normalizes Symbol.toPrimitive request methods to uppercase", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/orders",
      method: {
        [Symbol.toPrimitive]: () => " delete ",
      },
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "method_symbol_normalization_case" }, async () => ({ ok: true }))

    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "api_start",
        method: "DELETE",
      }),
    )
  })

  it("falls back request method to UNKNOWN when token contains spaces", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/orders",
      method: "post override",
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "method_invalid_space_case" }, async () => ({ ok: true }))

    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "api_start",
        method: "UNKNOWN",
      }),
    )
  })

  it("falls back request method to UNKNOWN when serialized token contains invalid separators", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = {
      url: "http://localhost/api/trading/orders",
      method: {
        [Symbol.toPrimitive]: () => "patch/get",
      },
      headers: new Headers(),
    } as unknown as Request

    await withApiTelemetry(req, { name: "method_invalid_separator_case" }, async () => ({ ok: true }))

    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "api_start",
        method: "UNKNOWN",
      }),
    )
  })

  it("logs thrown string errors as err message", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "orders_post" }, async () => {
        throw "  dependency timeout  "
      }),
    ).rejects.toBe("  dependency timeout  ")

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "orders_post",
        err: "dependency timeout",
      }),
    )
  })

  it("normalizes whitespace-heavy error messages in telemetry", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "orders_post" }, async () => {
        throw new Error("  upstream\tservice\n\nis   unavailable  ")
      }),
    ).rejects.toThrow("  upstream\tservice\n\nis   unavailable  ")

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api_error",
        name: "orders_post",
        err: "upstream service is unavailable",
      }),
    )
  })

  it("truncates oversized telemetry error messages with ellipsis", async () => {
    const info = jest.fn()
    const error = jest.fn()
    withRequestMock.mockReturnValue({ info, error })

    const longMessage = `failure-${"x".repeat(1000)}`
    const req = new Request("http://localhost/api/trading/orders", { method: "POST" })
    await expect(
      withApiTelemetry(req, { name: "orders_post" }, async () => {
        throw new Error(longMessage)
      }),
    ).rejects.toThrow(longMessage)

    const loggedPayload = error.mock.calls[0]?.[0] as { err?: string }
    expect(typeof loggedPayload.err).toBe("string")
    expect(loggedPayload.err?.length).toBe(500)
    expect(loggedPayload.err?.endsWith("…")).toBe(true)
  })
})
