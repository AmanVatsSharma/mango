---
name: marketpulse-marketing-migration
overview: Port TradeBazaar’s marketing page system into tradingpro-platform while preserving the existing MarketPulse hero homepage as-is. Add all other marketing routes/components with MarketPulse branding and wire them to public routing and shared styling/config.
todos:
  - id: create-marketpulse-marketing-components
    content: Port and rebrand TradeBazaar marketing shell/header/widgets into tradingpro-platform components/marketing/marketpulse-home
    status: completed
  - id: create-marketing-routes
    content: Add all missing public marketing pages in tradingpro-platform/app using MarketPulse-branded content
    status: completed
  - id: wire-config-and-styles
    content: Update middleware public routes, next.config env toggles, and globals.css utilities needed for new pages
    status: completed
  - id: add-tests-and-docs
    content: Add marketing content shape test and update MODULE_DOC changelog entries for components/lib/marketing module
    status: completed
  - id: validate-end-to-end
    content: Run lint/tests and perform route smoke checks ensuring homepage hero remains unchanged
    status: completed
isProject: false
---

# MarketPulse Marketing Pages Migration Plan

## Scope Confirmed

- Target app: `[tradingpro-platform](tradingpro-platform)`
- Keep current hero page at `[tradingpro-platform/app/page.tsx](tradingpro-platform/app/page.tsx)` unchanged.
- Add complete TradeBazaar-inspired marketing setup for all other website/marketing pages with MarketPulse branding.

## Implementation Steps

- Add a new marketing module under `[tradingpro-platform/components/marketing/marketpulse-home/](tradingpro-platform/components/marketing/marketpulse-home/)` by adapting these source files from TradeBazaar:
  - `[TradeBazaar/components/marketing/tradebazaar-home/tradebazaar-header.tsx](TradeBazaar/components/marketing/tradebazaar-home/tradebazaar-header.tsx)`
  - `[TradeBazaar/components/marketing/tradebazaar-home/marketing-page-shell.tsx](TradeBazaar/components/marketing/tradebazaar-home/marketing-page-shell.tsx)`
  - `[TradeBazaar/components/marketing/tradebazaar-home/scheduled-upgrade-banner.tsx](TradeBazaar/components/marketing/tradebazaar-home/scheduled-upgrade-banner.tsx)`
  - `[TradeBazaar/components/marketing/tradebazaar-home/joinchat-widget.tsx](TradeBazaar/components/marketing/tradebazaar-home/joinchat-widget.tsx)`
  - `[TradeBazaar/components/marketing/tradebazaar-home/platform-sticky-buttons.tsx](TradeBazaar/components/marketing/tradebazaar-home/platform-sticky-buttons.tsx)`
  - `[TradeBazaar/components/marketing/tradebazaar-home/index.ts](TradeBazaar/components/marketing/tradebazaar-home/index.ts)`
- Rebrand copied content from TradeBazaar -> MarketPulse (labels, headings, footer copy, mailto text, widget defaults, CTA labels). Keep route names aligned to newly created MarketPulse pages.
- Add a MarketPulse marketing content config at `[tradingpro-platform/lib/marketing/marketpulse-homepage-content.ts](tradingpro-platform/lib/marketing/marketpulse-homepage-content.ts)` adapted from `[TradeBazaar/lib/marketing/tradebazaar-homepage-content.ts](TradeBazaar/lib/marketing/tradebazaar-homepage-content.ts)`, and add matching shape tests in `[tradingpro-platform/tests/marketing/](tradingpro-platform/tests/marketing/)`.
- Create all missing marketing routes in `[tradingpro-platform/app/](tradingpro-platform/app/)` inspired by TradeBazaar pages:
  - `contact`, `blog`, `news-blogs`, `affiliate`, `downloads`, `privacy-policy`, `terms`
  - `products` + child pages (`cfd-instrument`, `indexes`, `stocks`, `commodity`)
  - `payment-method` + child pages (`bank-transfer`, `upi-transfer`, `cash-payment`, `crypto-usdt-trc20`)
  - Why page with MarketPulse branding (and ensure header/footer links point to this route)
- Update public-route allowlist and static asset handling in `[tradingpro-platform/middleware.ts](tradingpro-platform/middleware.ts)` so all new marketing routes are publicly accessible and any new marketing asset folder is bypassed correctly.
- Extend marketing styles in `[tradingpro-platform/app/globals.css](tradingpro-platform/app/globals.css)` with CTA/card utility classes required by the imported marketing components (MarketPulse-branded class naming).
- Update `[tradingpro-platform/next.config.mjs](tradingpro-platform/next.config.mjs)` env exposure for marketing banner/chat toggles (to match behavior used by scheduled banner and chat widget).

## Documentation & Compliance

- Add top-of-file headers to all new TS/TSX files per workspace header rules.
- Create/update module doc for the new marketing module at `[tradingpro-platform/components/marketing/marketpulse-home/MODULE_DOC.md](tradingpro-platform/components/marketing/marketpulse-home/MODULE_DOC.md)`.
- Update changelog entries in:
  - `[tradingpro-platform/components/MODULE_DOC.md](tradingpro-platform/components/MODULE_DOC.md)`
  - `[tradingpro-platform/lib/MODULE_DOC.md](tradingpro-platform/lib/MODULE_DOC.md)`
- Run quality checks requested by workspace rules after implementation (lint/tests, duplicate-file scan, cycle check if available in scripts).

## Validation

- Route smoke check for all new pages (no 404, consistent header/footer nav, CTA links resolve).
- Confirm `/` remains unchanged hero experience.
- Confirm branding no longer shows TradeBazaar text in added MarketPulse pages/components.
- Run lints/tests for touched files and fix introduced issues.

