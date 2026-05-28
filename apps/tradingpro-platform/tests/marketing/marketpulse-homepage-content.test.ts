/**
 * @file tests/marketing/marketpulse-homepage-content.test.ts
 * @module tests/marketing
 * @description Validate MarketPulse marketing homepage content config shape and internal link policy.
 * @author StockTrade
 * @created 2026-02-19
 */

import { z } from "zod"
import { MARKETPULSE_HOMEPAGE_CONTENT } from "@/lib/marketing/marketpulse-homepage-content"

const internalHref = z.string().refine((value) => value.startsWith("/") || value.startsWith("#"), {
  message: "href must start with '/' or '#'",
})

const schema = z.object({
  hero: z.object({
    headline: z.string().min(1),
    productTabs: z.array(z.string().min(1)).min(1),
    subheadline: z.string().min(1),
    ctas: z.object({
      primaryLabel: z.string().min(1),
      primaryHref: internalHref,
      secondaryLabel: z.string().min(1),
      secondaryHref: internalHref,
    }),
  }),
  stats: z.object({
    value: z.string().min(1),
    label: z.string().min(1),
    ctas: z.object({
      leftLabel: z.string().min(1),
      leftHref: internalHref,
      rightLabel: z.string().min(1),
      rightHref: internalHref,
    }),
  }),
  highlights: z.array(z.string().min(1)),
  platforms: z.array(z.object({ label: z.string().min(1), href: internalHref })),
  blogTitles: z.array(z.string().min(1)),
})

describe("MARKETPULSE_HOMEPAGE_CONTENT", () => {
  it("matches expected shape", () => {
    const parsed = schema.parse(MARKETPULSE_HOMEPAGE_CONTENT)
    expect(parsed.hero.productTabs.length).toBeGreaterThanOrEqual(4)
  })

  it("keeps expected list counts", () => {
    expect(MARKETPULSE_HOMEPAGE_CONTENT.highlights).toHaveLength(4)
    expect(MARKETPULSE_HOMEPAGE_CONTENT.platforms).toHaveLength(4)
    expect(MARKETPULSE_HOMEPAGE_CONTENT.blogTitles).toHaveLength(4)
  })
})
