# `components/admin-v2/primitives/`

Reusable building blocks for the v2 admin console. Thin wrappers around the existing shadcn/Radix primitives (`components/ui/`) plus the new TanStack Table/Virtual + Vaul stack added in Phase 1.

## Inventory (Phase 1 ships the bold ones)

| Primitive | File | Status | Notes |
|---|---|---|---|
| **DataTable** | `data-table.tsx` | Phase 1 | TanStack Table + Virtual wrapper. Sort, filter, column-pin, multi-select, virtual rows, bulk action bar, CSV export. |
| **Drawer** | `drawer.tsx` | Phase 1 | Vaul wrapper; the canonical right-side slide-in for Client 360 and bulk actions. |
| **KpiTile** | `kpi-tile.tsx` | Phase 1 | Number + delta + sparkline slot. Mono numerals. |
| **StatusPill** | `status-pill.tsx` | Phase 1 | Replaces 20+ ad-hoc Badge usages — single source for status colors. |
| **EmptyState** | `empty-state.tsx` | Phase 1 | Illustration + title + CTA. Accessible. |
| SegmentChip | `segment-chip.tsx` | Phase 2 | Segment pill (NSE / NFO / CDS / MCX) with custom glyph. |
| PriorityChip | `priority-chip.tsx` | Phase 2 | LOW / NORMAL / HIGH chip for CRM tasks. |
| SlaTimer | `sla-timer.tsx` | Phase 3 | Countdown chip with breach colors. |
| InlineEditField | `inline-edit-field.tsx` | Phase 2 | Click → edit → save (text, number, select). |
| Timeline | `timeline.tsx` | Phase 2 | Generic timeline (activity / KYC review log / audit). |
| DocumentViewer | `document-viewer.tsx` | Phase 3 | Image/PDF with zoom / rotate / side-by-side slot (`react-zoom-pan-pinch`). |

## Design Principles

1. **Wrap, don't reinvent** — every primitive is a thin wrapper that adds opinions (defaults, broker design tokens) over an existing battle-tested library.
2. **Status colors live here** — `status-pill.tsx` exports the canonical `StatusKind` enum. Other components consume it; never inline status colors.
3. **Tabular numerals everywhere money is shown** — every primitive that renders amounts applies `font-variant-numeric: tabular-nums slashed-zero` (the project's `tabular-nums` Tailwind utility).
4. **Empty / error / loading are first-class** — DataTable and KpiTile both expose `loading`, `error`, and `empty` props; never fall back to bare spinners.
5. **No data fetching inside primitives** — they are *display* components. Fetching happens at the page or section level via SWR.
