/**
 * @file order-admission-margin.test.ts
 * @module tests-order
 * @description Unit tests for order admission margin release / fill reconciliation helpers.
 * @author StockTrade
 * @created 2026-03-25
 */

import {
  reconcileOrderAdmissionAfterFillTx,
  releaseOrderAdmissionOnCancelTx,
} from "@/lib/services/order/order-admission-margin"

describe("order-admission-margin", () => {
  it("releaseOrderAdmissionOnCancelTx releases margin, refunds placement charges, clears order fields", async () => {
    const releaseMarginTx = jest.fn().mockResolvedValue(undefined)
    const creditTx = jest.fn().mockResolvedValue(undefined)
    const fundService = { releaseMarginTx, creditTx } as any
    const orderUpdate = jest.fn().mockResolvedValue({})
    const tx = { order: { update: orderUpdate } } as any

    await releaseOrderAdmissionOnCancelTx(tx, fundService, {
      orderId: "ord-1",
      tradingAccountId: "acct-1",
      blockedMargin: 500,
      placementCharges: 20,
      marginReleaseDescription: "margin-desc",
      chargesRefundDescription: "charges-desc",
    })

    expect(releaseMarginTx).toHaveBeenCalledWith(tx, "acct-1", 500, "margin-desc", { orderId: "ord-1" })
    expect(creditTx).toHaveBeenCalledWith(tx, "acct-1", 20, "charges-desc", { orderId: "ord-1" })
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "ord-1" },
      data: { blockedMargin: 0, placementCharges: 0 },
    })
  })

  it("releaseOrderAdmissionOnCancelTx is a no-op when amounts are zero", async () => {
    const releaseMarginTx = jest.fn()
    const creditTx = jest.fn()
    const fundService = { releaseMarginTx, creditTx } as any
    const orderUpdate = jest.fn()
    const tx = { order: { update: orderUpdate } } as any

    await releaseOrderAdmissionOnCancelTx(tx, fundService, {
      orderId: "ord-2",
      tradingAccountId: "acct-1",
      blockedMargin: 0,
      placementCharges: 0,
      marginReleaseDescription: "x",
      chargesRefundDescription: "y",
    })

    expect(releaseMarginTx).not.toHaveBeenCalled()
    expect(creditTx).not.toHaveBeenCalled()
    expect(orderUpdate).not.toHaveBeenCalled()
  })

  it("reconcileOrderAdmissionAfterFillTx releases margin only and clears fields", async () => {
    const releaseMarginTx = jest.fn().mockResolvedValue(undefined)
    const creditTx = jest.fn()
    const fundService = { releaseMarginTx, creditTx } as any
    const orderUpdate = jest.fn().mockResolvedValue({})
    const tx = { order: { update: orderUpdate } } as any

    await reconcileOrderAdmissionAfterFillTx(tx, fundService, {
      orderId: "ord-3",
      tradingAccountId: "acct-1",
      blockedMargin: 400,
      placementCharges: 15,
      marginReleaseDescription: "admission-release",
    })

    expect(releaseMarginTx).toHaveBeenCalledWith(tx, "acct-1", 400, "admission-release", { orderId: "ord-3" })
    expect(creditTx).not.toHaveBeenCalled()
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "ord-3" },
      data: { blockedMargin: 0, placementCharges: 0 },
    })
  })
})
