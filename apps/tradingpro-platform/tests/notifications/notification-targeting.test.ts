/**
 * File: tests/notifications/notification-targeting.test.ts
 * Module: notifications
 * Purpose: Verify notification targeting helper behavior.
 * Author: StockTrade
 * Last-updated: 2026-01-20
 * Notes:
 * - Focuses on admin opt-in visibility and SPECIFIC targeting.
 * - Uses pure helpers for deterministic behavior.
 */

import {
  buildTargetConditions,
  canIncludeAdminTargets,
  isNotificationVisibleToUser
} from "@/lib/services/notifications/notification-targeting"

describe("notification targeting helpers", () => {
  it("gates admin targets behind explicit opt-in", () => {
    expect(canIncludeAdminTargets("ADMIN", true)).toBe(true)
    expect(canIncludeAdminTargets("ADMIN", false)).toBe(false)
    expect(canIncludeAdminTargets("USER", true)).toBe(false)
  })

  it("builds target conditions with optional admin targets", () => {
    const withoutAdmins = buildTargetConditions("user-1", false)
    const withAdmins = buildTargetConditions("user-1", true)

    expect(withoutAdmins.some((entry) => entry?.target === "ADMINS")).toBe(false)
    expect(withAdmins.some((entry) => entry?.target === "ADMINS")).toBe(true)
  })

  it("evaluates notification visibility correctly", () => {
    const userId = "user-1"

    expect(
      isNotificationVisibleToUser({
        target: "ALL",
        targetUserIds: [],
        userId,
        allowAdminTargets: false
      })
    ).toBe(true)

    expect(
      isNotificationVisibleToUser({
        target: "USERS",
        targetUserIds: [],
        userId,
        allowAdminTargets: false
      })
    ).toBe(true)

    expect(
      isNotificationVisibleToUser({
        target: "ADMINS",
        targetUserIds: [],
        userId,
        allowAdminTargets: false
      })
    ).toBe(false)

    expect(
      isNotificationVisibleToUser({
        target: "ADMINS",
        targetUserIds: [],
        userId,
        allowAdminTargets: true
      })
    ).toBe(true)

    expect(
      isNotificationVisibleToUser({
        target: "SPECIFIC",
        targetUserIds: ["user-1", "user-2"],
        userId,
        allowAdminTargets: false
      })
    ).toBe(true)

    expect(
      isNotificationVisibleToUser({
        target: "SPECIFIC",
        targetUserIds: ["user-2"],
        userId,
        allowAdminTargets: false
      })
    ).toBe(false)

    expect(
      isNotificationVisibleToUser({
        target: "UNKNOWN",
        targetUserIds: [],
        userId,
        allowAdminTargets: false
      })
    ).toBe(false)
  })
})
