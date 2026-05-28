/**
 * File:        app/(console)/console/page.tsx
 * Module:      Console · Route entry (server component)
 * Purpose:     Server-rendered shell for /console. The interactive section state lives
 *              in <ConsoleClient>; the 9 section components are dynamically imported so
 *              first paint only ships the active section's chunk.
 *
 * Exports:
 *   - default ConsolePage()
 *
 * Depends on:
 *   - @/components/console/console-client — client controller (state + dynamic sections)
 *
 * Side-effects: none at the route level
 *
 * Key invariants:
 *   - Stays a server component. Adding "use client" here would re-pin the route to
 *     full client rendering and undo the Wave 1 SSR shell.
 *
 * Read order:
 *   1. ConsolePage — server entry
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import { ConsoleClient } from "@/components/console/console-client"

export default function ConsolePage() {
  return <ConsoleClient />
}
