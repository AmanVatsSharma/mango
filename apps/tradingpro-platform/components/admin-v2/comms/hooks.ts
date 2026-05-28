/**
 * @file components/admin-v2/comms/hooks.ts
 * @module admin-v2/comms
 * @description SWR hooks for the comms module — templates, campaigns, messages, consents.
 *              All hooks revalidate on focus disabled; messages refresh every 15s for the
 *              live-feed feel; consent + template lists revalidate on demand only.
 *
 *              Exports:
 *                - useTemplates(filter?)
 *                - useCampaigns(filter?)
 *                - useMessages(filter, page)        — paginated feed
 *                - useUserConsents(userId)
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import useSWR from "swr"
import { jsonFetcher } from "@/lib/admin-v2/api-client"
import type {
  Channel,
  CampaignListResp,
  CampaignStatus,
  ConsentListResp,
  MessageDirection,
  MessageListResp,
  MessageStatus,
  TemplateListResp,
  TemplateStatus,
} from "./types"

interface TemplateFilter {
  channel?: Channel
  status?: TemplateStatus
  q?: string
}

function buildQs(params: Record<string, string | undefined | null>) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v)
  }
  const s = qs.toString()
  return s ? `?${s}` : ""
}

export function useTemplates(filter: TemplateFilter = {}) {
  return useSWR<TemplateListResp>(
    `/api/admin/comms/templates${buildQs({ ...filter })}`,
    jsonFetcher,
    { revalidateOnFocus: false },
  )
}

interface CampaignFilter {
  channel?: Channel
  status?: CampaignStatus
  q?: string
}

export function useCampaigns(filter: CampaignFilter = {}) {
  return useSWR<CampaignListResp>(
    `/api/admin/comms/campaigns${buildQs({ ...filter })}`,
    jsonFetcher,
    { revalidateOnFocus: false },
  )
}

interface MessageFilter {
  userId?: string
  channel?: Channel
  status?: MessageStatus
  direction?: MessageDirection
  campaignId?: string
  q?: string
}

export function useMessages(
  filter: MessageFilter = {},
  page: { page?: number; limit?: number } = {},
) {
  return useSWR<MessageListResp>(
    `/api/admin/comms/messages${buildQs({
      ...filter,
      page: page.page ? String(page.page) : undefined,
      limit: page.limit ? String(page.limit) : undefined,
    })}`,
    jsonFetcher,
    { refreshInterval: 15_000, revalidateOnFocus: false },
  )
}

export function useUserConsents(userId: string | null | undefined) {
  return useSWR<ConsentListResp>(
    userId ? `/api/admin/comms/consents?userId=${encodeURIComponent(userId)}` : null,
    jsonFetcher,
    { revalidateOnFocus: false },
  )
}
