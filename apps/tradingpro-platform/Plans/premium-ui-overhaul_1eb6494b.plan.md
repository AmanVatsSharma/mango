---
name: premium-ui-overhaul
overview: Overhaul the homepage, auth flow, and marketing pages with 3D abstract illustrations, lucide-react icons, and framer-motion animations to create a premium, modern, tech-focused trading broker experience.
todos:
  - id: update-assets
    content: Update `BRAND_ASSETS` in `assets.ts` with 3D illustration placeholders.
    status: completed
  - id: redesign-auth-flow
    content: Redesign `MobileAuthFlow.tsx` with 3D illustration and framer-motion transitions.
    status: completed
  - id: update-auth-icons
    content: Replace `react-icons` with `lucide-react` in all Auth forms (Login, Register, etc.).
    status: completed
  - id: upgrade-hero-section
    content: Enhance `MarketPulseHeroSection` with 3D placeholder and entrance animations.
    status: completed
  - id: upgrade-homepage-sections
    content: Update Homepage Stats, Highlights, and Benefits sections with lucide icons, glassmorphism, and scroll animations.
    status: completed
  - id: standardize-marketing-pages
    content: Apply techy hero banners and animations to other marketing pages (Contact, Why Us).
    status: completed
isProject: false
---

# Premium Modern UI Overhaul Plan

This plan outlines the steps to upgrade the UI of the `/` homepage, auth pages, and other marketing pages to achieve a premium, modern, techy, and deploy-ready aesthetic using 3D abstract illustration placeholders, `lucide-react` icons, and `framer-motion`.

## 1. Asset Configuration Updates

We will extend the central branding configuration to support new 3D abstract illustration placeholders.

- **Target File**: `tradingpro-platform/Branding/assets.ts`
- **Changes**: Add an `illustrations` object to `BRAND_ASSETS` containing paths for:
  - `hero3D`: A high-quality abstract trading chart placeholder for the homepage hero.
  - `auth3D`: A 3D glassmorphic placeholder for the auth split-screen.
  - `benefits3D`: A 3D asset placeholder for the benefits/margin section.

## 2. Authentication Flow Enhancement

We will upgrade the mobile-first auth flow to look stunning on desktop screens.

- **Target File**: `tradingpro-platform/components/auth/MobileAuthFlow.tsx`
- **Changes**:
  - Enhance the left-side informational pane with a full-bleed `Image` using the `auth3D` placeholder asset, overlaying the text with a glassmorphic (`backdrop-blur`) dark gradient card.
  - Wrap the right-side forms (Login, Register, OTP, mPin) in a `framer-motion` `<motion.div>` for smooth slide-up and fade-in transitions between steps.

## 3. Auth Form Icon Refinement

- **Target Files**: `tradingpro-platform/components/auth/MobileLoginForm.tsx` (and related forms)
- **Changes**:
  - Replace `react-icons` (e.g., `FaMobile`, `FaLock`) with premium `lucide-react` icons (e.g., `Smartphone`, `Lock`, `Eye`).
  - Improve input focus states with glowing rings (`focus:ring-emerald-500/50` or similar primary brand color variants).

## 4. Homepage Sections Upgrade

We will inject life, motion, and modern aesthetics into the main marketing landing page.

- **Target File**: `tradingpro-platform/components/marketing/marketpulse-home/marketpulse-sections.tsx`
- **Changes**:
  - **Hero Section**: 
    - Convert `MarketPulseHeroSection` into a two-column layout with text on the left and the `hero3D` illustration on the right. 
    - Add `framer-motion` staggered fade-up animations to the headline, subheadline, and CTA buttons.
  - **Stats & Highlights**:
    - Update `MarketPulseStatsSection` and `MarketPulseHighlightsSection` to use glassmorphic cards with subtle translucent borders.
    - Introduce `lucide-react` icons to the highlight cards (e.g., `Zap` for Zero Brokerage, `ShieldCheck` for Security).
  - **Benefits & Margin Section**:
    - Add the `benefits3D` placeholder beside the descriptive text.
    - Animate the feature cards to slide in on scroll using `framer-motion`'s `whileInView`.
  - **Platforms Section**:
    - Add `<motion.div>` hover scale effects (`whileHover={{ scale: 1.05 }}`) to the platform cards to make them feel interactive and premium.

## 5. Other Marketing Pages Standardization

- **Target Files**: `tradingpro-platform/app/contact/page.tsx`, `why-marketpulse/page.tsx`, etc.
- **Changes**:
  - Ensure all internal marketing pages share a consistent hero banner that utilizes a subtle animated background or 3D abstract placeholder, keeping the "techy" vibe uniform across the site.

