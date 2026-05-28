/**
 * File: lib/server/home-dashboard-config.ts
 * Module: home-dashboard
 * Purpose: Resolve global + user Home dashboard config settings from SystemSettings.
 * Author: StockTrade
 * Last-updated: 2026-02-17
 * Notes:
 * - Global defaults are stored as key `home_tab_config` with `ownerId=null`.
 * - User overrides are stored as key `home_tab_config_override` with `ownerId=<userId>`.
 */

import { prisma } from "@/lib/prisma"
import {
  DEFAULT_HOME_DASHBOARD_CONFIG,
  mergeHomeDashboardConfig,
  normalizeHomeDashboardConfig,
  normalizeHomeDashboardConfigOverride,
  parseHomeDashboardConfigString,
  parseHomeDashboardOverrideString,
  type HomeDashboardConfig,
  type HomeDashboardConfigOverride,
} from "@/lib/home-dashboard/home-dashboard-config-schema"

export const HOME_TAB_CONFIG_KEY = "home_tab_config" as const
export const HOME_TAB_CONFIG_OVERRIDE_KEY = "home_tab_config_override" as const
export const HOME_TAB_SETTINGS_CATEGORY = "HOME_TAB" as const

export interface HomeDashboardConfigResolution {
  config: HomeDashboardConfig
  hasGlobalConfig: boolean
  hasUserOverride: boolean
  isDefault: boolean
}

async function getLatestActiveSettingByKey(input: { key: string; ownerId: string | null }) {
  const setting = await prisma.systemSettings.findFirst({
    where: {
      key: input.key,
      ownerId: input.ownerId,
      isActive: true,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      key: true,
      value: true,
      ownerId: true,
      updatedAt: true,
    },
  })
  return setting
}

function normalizePersistedConfig(rawValue: unknown): HomeDashboardConfig {
  if (typeof rawValue !== "string") {
    return { ...DEFAULT_HOME_DASHBOARD_CONFIG }
  }
  return parseHomeDashboardConfigString(rawValue)
}

function normalizePersistedOverride(rawValue: unknown): HomeDashboardConfigOverride | null {
  if (typeof rawValue !== "string") {
    return null
  }
  return parseHomeDashboardOverrideString(rawValue)
}

export async function resolveHomeDashboardConfig(userId?: string): Promise<HomeDashboardConfigResolution> {
  const safeUserId = typeof userId === "string" && userId.trim() ? userId.trim() : null
  const globalSetting = await getLatestActiveSettingByKey({
    key: HOME_TAB_CONFIG_KEY,
    ownerId: null,
  })
  const userSetting = safeUserId
    ? await getLatestActiveSettingByKey({
        key: HOME_TAB_CONFIG_OVERRIDE_KEY,
        ownerId: safeUserId,
      })
    : null

  const globalConfig = globalSetting
    ? normalizePersistedConfig(globalSetting.value)
    : normalizeHomeDashboardConfig(DEFAULT_HOME_DASHBOARD_CONFIG)
  const userOverride = userSetting ? normalizePersistedOverride(userSetting.value) : null
  const effectiveConfig = mergeHomeDashboardConfig(globalConfig, userOverride)

  return {
    config: effectiveConfig,
    hasGlobalConfig: Boolean(globalSetting),
    hasUserOverride: Boolean(userOverride),
    isDefault: !globalSetting,
  }
}

export async function upsertUserHomeDashboardOverride(
  userId: string,
  rawOverride: unknown,
): Promise<HomeDashboardConfigOverride> {
  const normalizedUserId = userId.trim()
  const normalizedOverride = normalizeHomeDashboardConfigOverride(rawOverride)
  const serializedOverride = JSON.stringify(normalizedOverride)

  await prisma.$transaction(async (tx) => {
    const existingSetting = await tx.systemSettings.findFirst({
      where: {
        key: HOME_TAB_CONFIG_OVERRIDE_KEY,
        ownerId: normalizedUserId,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })

    if (existingSetting) {
      await tx.systemSettings.update({
        where: { id: existingSetting.id },
        data: {
          value: serializedOverride,
          category: HOME_TAB_SETTINGS_CATEGORY,
          description: "User-specific dashboard home widget configuration override",
          isActive: true,
          updatedAt: new Date(),
        },
      })
      await tx.systemSettings.updateMany({
        where: {
          key: HOME_TAB_CONFIG_OVERRIDE_KEY,
          ownerId: normalizedUserId,
          id: { not: existingSetting.id },
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      })
      return
    }

    await tx.systemSettings.create({
      data: {
        key: HOME_TAB_CONFIG_OVERRIDE_KEY,
        ownerId: normalizedUserId,
        value: serializedOverride,
        category: HOME_TAB_SETTINGS_CATEGORY,
        description: "User-specific dashboard home widget configuration override",
        isActive: true,
      },
    })
  })

  return normalizedOverride
}

export async function resetUserHomeDashboardOverride(userId: string): Promise<void> {
  const normalizedUserId = userId.trim()
  await prisma.systemSettings.updateMany({
    where: {
      key: HOME_TAB_CONFIG_OVERRIDE_KEY,
      ownerId: normalizedUserId,
      isActive: true,
    },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
  })
}
