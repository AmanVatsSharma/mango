/**
 * @file components/admin-v2/home/home-header.tsx
 * @module admin-v2/home
 * @description Shared hero header for every home variant. Chip · gradient title · subtitle ·
 *              primary CTA + optional secondary CTA + Cmd+K hint.
 *
 *              Exports: default HomeHeader.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { StatusPill } from "@/components/admin-v2/primitives"
import type { StatusTone } from "@/components/admin-v2/primitives"

interface HomeHeaderProps {
  chip: { label: string; tone: StatusTone }
  title: React.ReactNode
  subtitle: React.ReactNode
  primaryCta?: { href: string; label: string }
  secondaryCta?: { href: string; label: string }
}

export default function HomeHeader({
  chip,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
}: HomeHeaderProps) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2">
        <StatusPill tone={chip.tone} label={chip.label} size="sm" />
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
          v2 home · refreshes live
        </span>
      </div>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight v2-text-grad-primary">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--v2-text-mute)]">
        {subtitle}
      </p>
      {primaryCta || secondaryCta ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {primaryCta ? (
            <Link
              href={primaryCta.href}
              className="v2-btn-cta inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            >
              {primaryCta.label} <span aria-hidden>→</span>
            </Link>
          ) : null}
          {secondaryCta ? (
            <Link
              href={secondaryCta.href}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-[var(--v2-text)] hover:border-[var(--v2-border-accent)]"
            >
              {secondaryCta.label}
            </Link>
          ) : null}
          <kbd className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-[var(--v2-text-mute)]">
            ⌘ K to search
          </kbd>
        </div>
      ) : null}
    </section>
  )
}
