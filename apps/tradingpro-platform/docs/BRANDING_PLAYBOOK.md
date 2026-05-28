# Branding Playbook

Use this checklist to re-skin the product quickly, including URL slugs.

## 1) Edit Only the Branding Core

Update these files first:

- `Branding/identity.ts`
- `Branding/theme.ts`
- `Branding/assets.ts`
- `Branding/marketing.ts`
- `Branding/index.ts`

What to change:

- **Identity:** product name, legal name, support emails, domain, metadata text, SMS sender/signature.
- **Routes:** update `routes.brandSlug`, `routes.legacyBrandSlugs`, and `routes.templates.*` in `Branding/identity.ts`.
- **Theme:** primary/accent colors, gradients, watchlist palette, semantic tokens.
- **Assets:** logo paths, icon paths, favicon mapping.
- **Marketing text:** nav labels, homepage copy, and public marketing page content in `Branding/marketing.ts`.
- **Index helpers:** URL and mailto builders (if domain/email behavior changes).

## 2) Route Slug System (Important)

- Keep UI route slugs in `Branding/identity.ts` only.
- Use helpers from `lib/branding-routes.ts` for all navigation:
  - `getMarketingRoute(...)`
  - `getAuthRoute(...)`
  - `getAppRoute(...)`
  - `getAdminConsoleRoute(...)`
  - `buildRouteWithQuery(...)`
- `middleware.ts` handles:
  - old slug -> current branded slug redirects
  - current branded slug -> filesystem canonical rewrites

Do not hardcode route literals in UI components/actions.

## 3) Replace Brand Assets

- Update files in `public/branding/` (logo mark/wordmark).
- If platform icons change, update paths referenced in `Branding/assets.ts`.

## 4) Run Validation

```bash
npm run check:branding
npm run type-check
```

If `check:branding` fails, move literals into `Branding/*` and reference constants/helpers instead.

## 5) Verify High-Impact Flows

- Marketing routes (`/`, contact, why-us slug, products, payment methods).
- Auth pages (login/register/verification/reset flows and mail links).
- Trading dashboard + error/maintenance states.
- Admin and watchlist color surfaces.
- Legacy slugs redirect to current branded slugs.

## 6) Optional Hardening Before Release

- Run `npm run check:duplicate-files`.
- Run cycle check: `npm run check:desktop-ux-cycles`.
- Update module docs changelog entries for touched modules.
