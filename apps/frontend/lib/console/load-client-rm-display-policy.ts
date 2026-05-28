/**
 * @file load-client-rm-display-policy.ts
 * @module console
 * @description Loads global client RM display policy from SystemSettings (ownerId null).
 * @author StockTrade
 * @created 2026-03-27
 */

import { prisma } from "@/lib/prisma"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import {
  parseClientRmDisplayPolicyJson,
  type ClientRmDisplayPolicyV1,
} from "@/lib/types/rm-client-display"

export async function loadGlobalClientRmDisplayPolicy(): Promise<ClientRmDisplayPolicyV1> {
  const row = await prisma.systemSettings.findFirst({
    where: {
      key: ADMIN_SETTING_KEYS.CLIENT_RM_DISPLAY_POLICY_V1,
      ownerId: null,
      isActive: true,
    },
    orderBy: { updatedAt: "desc" },
  })
  return parseClientRmDisplayPolicyJson(row?.value ?? null)
}
