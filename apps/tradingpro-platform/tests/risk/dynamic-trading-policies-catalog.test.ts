/**
 * @file dynamic-trading-policies-catalog.test.ts
 * @module tests-risk
 * @description Verifies ORDER_PLACE policy catalog exposes LTP-offset enforcement fields.
 * @author StockTrade
 * @created 2026-02-17
 */

import { getTradingPolicyCatalog } from "@/lib/services/risk/dynamic-trading-policies"

describe("dynamic-trading-policies catalog", () => {
  it("includes order side and LTP-offset fields for ORDER_PLACE context", () => {
    const catalog = getTradingPolicyCatalog()
    const orderFields = catalog.fieldsByContext.ORDER_PLACE.map((field) => field.field)

    expect(orderFields).toEqual(
      expect.arrayContaining([
        "order.side",
        "order.orderType",
        "order.ltp",
        "order.priceOffsetFromLtp",
        "order.priceOffsetFromLtpPercent",
      ]),
    )
  })

  it("includes required POSITION_CLOSE and ORDER_PLACE fields for custom policy presets", () => {
    const catalog = getTradingPolicyCatalog()
    const positionCloseFields = catalog.fieldsByContext.POSITION_CLOSE.map((field) => field.field)
    const orderPlaceFields = catalog.fieldsByContext.ORDER_PLACE.map((field) => field.field)

    expect(positionCloseFields).toEqual(
      expect.arrayContaining([
        "position.segment",
        "position.productType",
        "position.holdMinutes",
        "account.availableMargin",
      ]),
    )
    expect(orderPlaceFields).toEqual(
      expect.arrayContaining([
        "order.side",
        "order.orderType",
        "order.segment",
        "order.productType",
        "order.turnover",
        "account.availableMargin",
      ]),
    )
  })

  it("exposes IN/NOT_IN/NEQ operators with string data type support", () => {
    const catalog = getTradingPolicyCatalog()
    const operatorByValue = new Map(catalog.operators.map((operator) => [operator.value, operator]))

    expect(operatorByValue.get("IN")?.supportedDataTypes).toEqual(expect.arrayContaining(["string"]))
    expect(operatorByValue.get("NOT_IN")?.supportedDataTypes).toEqual(expect.arrayContaining(["string"]))
    expect(operatorByValue.get("NEQ")?.supportedDataTypes).toEqual(expect.arrayContaining(["string"]))
  })
})
