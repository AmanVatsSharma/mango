# Admin Console UI Guide

This document outlines the visual system used by the admin console so new components stay consistent and professional.

## Design Tokens (Tailwind v4)
- Colors are defined in `app/globals.css` as CSS variables under `:root` and `.dark`.
- Use tokenized classes with Tailwind v4 color variables:
  - Backgrounds: `bg-background`, `bg-card`, `bg-muted`
  - Text: `text-foreground`, `text-muted-foreground`, `text-primary-foreground`
  - Borders: `border-border`, `border-primary/20`
  - Accents: `text-primary`, `bg-primary/10`

## Utilities
- `neon-border`: subtle premium halo on card borders
- `glass-surface`: translucent panel with blur and tokenized border

## Layout
- Container width: wrap primary content in `max-w-7xl mx-auto`
- Page padding: `p-3 md:p-6`
- Motion: use `framer-motion` fade/slide with `duration ~0.3-0.4`

## Header
- Class: `glass-surface border-b border-border p-4`
- Actions: ghost buttons, token-based borders and separators
- Search input: `bg-muted/50 border-border focus:border-primary`

## Sidebar
- Class: `glass-surface border-r border-border`
- Active item: `bg-primary/10 text-primary border border-primary/20 neon-border`
- Avoid direct `window.*` refs in animation; rely on CSS/responsive utilities

## Cards & Typography
- Card base: `bg-card/50 border-border`
- Emphasis: use `text-foreground` for primary text and `text-muted-foreground` for secondary
- Spacing: prefer consistent gaps (`gap-4`, `gap-6`) and padding (`p-4`, `p-6`)

## Logging (Debug)
- Add concise `console.log` on notable UI actions (tab changes, sidebar collapse, QR open)
- Prefix logs with `[ADMIN_CONSOLE]` for easy filtering

## Example
```tsx
<Card className="bg-card/50 border-border neon-border">
  <CardHeader>
    <CardTitle className="text-sm text-muted-foreground">Pending Deposits</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold text-foreground">42</div>
  </CardContent>
</Card>
```
