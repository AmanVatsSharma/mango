/**
 * File:        app/api/admin/home-page-config/route.ts
 * Module:      admin · home-page-config
 * Purpose:     Admin API for managing the homepage configuration (ticker symbols, featured tokens,
 *              highlights, stats, platform links, blog posts).
 *
 * Exports:
 *   - GET  — fetch or create default HomePageConfig
 *   - PUT  — upsert homepage configuration
 *
 * Depends on:
 *   - @/lib/prisma                   — database client
 *   - @/lib/rbac/admin-api           — RBAC middleware
 *   - @/src/common/errors            — AppError
 *
 * Side-effects:
 *   - Reads/writes `home_page_configs` table
 *
 * Key invariants:
 *   - Only one row ever exists (key = "home_page_config"); PUT performs upsert
 *   - Admin auth required for both GET and PUT
 *
 * Read order:
 *   1. GET / PUT handlers — entry points
 *   2. upsert pattern — wraps Prisma transaction
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-16
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"

/** Single-row key used to identify the homepage config row */
const HOME_PAGE_CONFIG_KEY = "home_page_config"

/** Default empty values returned when no config row exists yet */
const DEFAULT_HOME_PAGE_CONFIG = {
  key: HOME_PAGE_CONFIG_KEY,
  tickerSymbols: [],
  featuredTokens: [],
  highlights: [],
  statsData: [],
  platformLinks: [],
  blogPosts: [],
}

/**
 * GET — Fetch the current HomePageConfig.
 * Creates a default row if none exists (upsert on first read).
 */
export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/home-page-config",
      required: "admin.settings.manage",
      fallbackMessage: "Failed to fetch homepage configuration",
    },
    async (ctx) => {
      ctx.logger.debug({}, "GET /api/admin/home-page-config")

      const config = await prisma.homePageConfig.findUnique({
        where: { key: HOME_PAGE_CONFIG_KEY },
      })

      ctx.logger.info({ key: config?.key ?? "default" }, "GET /api/admin/home-page-config - success")

      return NextResponse.json(
        {
          success: true,
          config: config ?? DEFAULT_HOME_PAGE_CONFIG,
        },
        { status: 200 }
      )
    }
  )
}

/**
 * PUT — Upsert the full HomePageConfig.
 * Requires admin auth. Updates updatedAt and updatedById.
 */
export async function PUT(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/home-page-config",
      required: "admin.settings.manage",
      fallbackMessage: "Failed to save homepage configuration",
    },
    async (ctx) => {
      const body = await req.json()
      const { tickerSymbols, featuredTokens, highlights, statsData, platformLinks, blogPosts } = body

      ctx.logger.debug(
        {
          hasTickerSymbols: Array.isArray(tickerSymbols),
          hasFeaturedTokens: Array.isArray(featuredTokens),
          hasHighlights: Array.isArray(highlights),
          hasStatsData: Array.isArray(statsData),
          hasPlatformLinks: Array.isArray(platformLinks),
          hasBlogPosts: Array.isArray(blogPosts),
        },
        "PUT /api/admin/home-page-config - request"
      )

      const updatedById = ctx.session.user?.id

      const config = await prisma.homePageConfig.upsert({
        where: { key: HOME_PAGE_CONFIG_KEY },
        update: {
          tickerSymbols: Array.isArray(tickerSymbols) ? tickerSymbols : [],
          featuredTokens: featuredTokens ?? [],
          highlights: highlights ?? [],
          statsData: statsData ?? [],
          platformLinks: platformLinks ?? [],
          blogPosts: blogPosts ?? [],
          updatedById: updatedById ?? null,
        },
        create: {
          key: HOME_PAGE_CONFIG_KEY,
          tickerSymbols: Array.isArray(tickerSymbols) ? tickerSymbols : [],
          featuredTokens: featuredTokens ?? [],
          highlights: highlights ?? [],
          statsData: statsData ?? [],
          platformLinks: platformLinks ?? [],
          blogPosts: blogPosts ?? [],
          updatedById: updatedById ?? null,
        },
      })

      ctx.logger.info({ key: config.key }, "PUT /api/admin/home-page-config - success")

      return NextResponse.json(
        {
          success: true,
          config,
          message: "Homepage configuration saved successfully",
        },
        { status: 200 }
      )
    }
  )
}