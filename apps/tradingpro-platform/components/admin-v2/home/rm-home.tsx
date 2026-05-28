/**
 * @file components/admin-v2/home/rm-home.tsx
 * @module admin-v2/home
 * @description RM-persona home variant. Embeds the Callback Radar as the hero — that IS the
 *              RM workbench's daily start point. Links to the full RM workbench + their book.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import CallbackRadar from "@/components/admin-v2/crm/callback-radar"
import HomeHeader from "./home-header"

export default function RmHome() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <HomeHeader
        chip={{ label: "RM", tone: "warning" }}
        title="My day"
        subtitle="Triage your callback queue · open clients in Client 360 · log notes inline."
        primaryCta={{ href: "/admin-v2/sales", label: "Open Sales Workbench" }}
        secondaryCta={{ href: "/admin-v2/clients", label: "My Book" }}
      />
      <CallbackRadar embedded />
    </div>
  )
}
