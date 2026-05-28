/**
 * @file components/admin-v2/client-360/tabs/index.ts
 * @module admin-v2/client-360
 * @description Lazy-tab registry. Overview is mounted eagerly (default tab); every other tab
 *              is React.lazy and resolves on activation. This keeps the initial Client 360
 *              bundle small and the drawer-open path under the per-tab budget set in the plan.
 *
 *              Exports:
 *                - tabRegistry  — Record<TabKey, ComponentType<{user}>> with lazy where appropriate.
 *                - OverviewTab  — re-export of the eager Overview module.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { lazy, type ComponentType } from "react"
import OverviewTab from "./overview"
import type { TabKey } from "../types"
import type { UserDetail } from "../types"

type TabComponent = ComponentType<{ user: UserDetail }>

export const tabRegistry: Record<TabKey, TabComponent> = {
  overview: OverviewTab,
  compliance: lazy(() => import("./compliance")),
  trading: lazy(() => import("./trading")),
  funds: lazy(() => import("./funds")),
  crm: lazy(() => import("./crm")),
  risk: lazy(() => import("./risk")),
  winners: lazy(() => import("./winners")),
  bonuses: lazy(() => import("./bonuses")),
  affiliate: lazy(() => import("./affiliate")),
  comms: lazy(() => import("./comms")),
  sessions: lazy(() => import("./sessions")),
  audit: lazy(() => import("./audit")),
}

export { OverviewTab }
