# Console Mobile Fix + Deposits Configuration

## Changelog (2026-03-25)
- **Deposit methods v1:** Admin configures all client-visible funding options via `payment_deposit_config_v1` (JSON in `SystemSettings`), edited in `/admin-console` → Settings → **Deposit methods** (`components/admin-console/payment-deposit-settings-panel.tsx`).
- **User console:** `GET /api/settings/payment` returns a public v1 payload (`version`, `order`, `methods`) with only enabled methods: UPI (multiple QR/IDs), domestic bank, cash, crypto wallets, international wire, cheque, external pay link, and an optional contact/support block.
- **Legacy:** Existing `payment_qr_code` / `payment_upi_id` rows are merged into the draft config when v1 is absent (same behavior on server via `resolvePaymentDepositConfigFromSettingsMap`).
- **Prisma:** `deposits` table adds optional `crypto_network`, `crypto_tx_hash`, `crypto_asset` for crypto proof; migration `20260325120000_deposit_crypto_fields`.
- **Amount limits:** Global and per-method min/max INR enforced in `ConsoleService.createDepositRequest` using `validateDepositAmountAgainstConfig`.
- **Parity:** Same behavior in `tradingpro-platform` (mirrored files).
- **Admin UPI block:** Deposit settings UPI section uses compact per-entry cards with QR image previews (placeholder + broken-URL fallback), click-to-pick on the thumbnail, Upload/Replace and Remove; title/description/badge and min/max/recommended live under collapsible **Display & limits**.

## Summary
- Fixed mobile scroll freeze on `/console` by:
  - Replacing `h-screen` with `min-h-[100dvh]` to handle iOS/Android dynamic viewport.
  - Ensuring the scrollable content uses `overflow-y-auto`, `overscroll-y-contain`, `scroll-smooth`, and `touchAction: 'pan-y'` with `-webkit-overflow-scrolling: touch`.
  - Keeping sidebar drawer body scroll lock only when open.
- Deposits are driven by **`payment_deposit_config_v1`** (see Changelog above). UPI still supports legacy single QR/UPI via merge when v1 is not stored yet.

## Flow
1. Admin — `/admin-console` → Settings → **Deposit methods**
   - Toggle methods, set copy/limits, add UPI rows (QR per row via `/api/admin/upload`), bank/crypto/wire/etc.
   - Save posts `payment_deposit_config_v1` to `/api/admin/settings` (validated with Zod on server).
2. User — `/console` → Deposits
   - `GET /api/settings/payment` loads public v1 payload.
   - `DepositForm` lists enabled methods; each opens the matching modal; `createDepositRequest` stores method + proof + crypto fields as applicable.

## Key Files
- `components/console/console-layout.tsx`
  - root: `min-h-[100dvh]`
  - main: `overflow-y-auto overscroll-y-contain scroll-smooth`, style: `WebkitOverflowScrolling: 'touch', touchAction: 'pan-y'`
- `components/console/console-loading-state.tsx` → `min-h-[100dvh]`
- `components/console/console-error-boundary.tsx` → `min-h-[100dvh]`
- `components/console/sections/deposits-section.tsx` — wires all deposit modals to public v1 settings
- `components/console/deposits/*-deposit-modal.tsx` — bank, cash, crypto, wire, cheque, external pay
- `components/console/deposits/upi-payment-modal.tsx` — `upiOptions[]` multi-UPI UX
- `components/admin-console/payment-deposit-settings-panel.tsx` — full admin editor
- `components/admin-console/settings.tsx` — embeds deposit panel, `fetchSettings` resolves draft via `resolvePaymentDepositConfigDraft`
- `lib/payment-deposit-public.ts`, `lib/payment-deposit-config.shared.ts`, `lib/server/payment-deposit-config.ts`
- `app/api/settings/payment/route.ts` (auth-only read for users)
- `app/api/admin/settings/route.ts` (admin-only write/read)
- `prisma/schema.prisma (SystemSettings)`

## Testing Checklist
- Mobile Safari/Chrome: open `/console`, scroll all sections, open/close sidebar.
- `/console` → Deposits → UPI modal shows admin QR and UPI ID.
- Copy UPI ID works, timer counts down, submit UTR flows.
- Admin: change QR/UPI, user modal reflects changes after refresh.

## Notes
- We intentionally still lock body scroll only while the mobile sidebar drawer is open.
- If any other page uses `h-screen`, consider similar `min-h-[100dvh]` swap.
- Payment settings write access remains admin-only via `/api/admin/settings`; user console reads via `/api/settings/payment`.
