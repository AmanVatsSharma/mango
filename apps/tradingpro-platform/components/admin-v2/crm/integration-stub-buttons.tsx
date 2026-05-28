/**
 * @file components/admin-v2/crm/integration-stub-buttons.tsx
 * @module admin-v2/crm
 * @description Disabled WhatsApp / SMS / call / email buttons that ship the UI shell + hover
 *              tooltip + link to the integrations config page. Phase 12 wires them to the
 *              real provider adapters (Knowlarity / Ozonetel / Twilio / Gupshup / Resend / SES).
 *
 *              Exports:
 *                - default CrmIntegrationStubButtons  — props { phone?, email? } (which buttons to enable as href-only).
 *
 *              Side-effects: none (links open `tel:` / `mailto:` / WhatsApp web — no provider call).
 *
 *              Key invariants:
 *                - Until Phase 12 ships, these buttons NEVER hit a backend. Today they either
 *                  open the OS handler (`tel:`, `mailto:`, `https://wa.me/<phone>`) or show
 *                  a "Configure provider" tooltip pointing to /admin-v2/comms (Phase 12 home).
 *                - This guarantees the UI surface is forward-compatible: when Phase 12 wires
 *                  the providers in, this component switches to provider-driven dispatch with
 *                  zero call-site changes.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Mail, MessageCircle, Phone, Settings } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface CrmIntegrationStubButtonsProps {
  phone?: string | null
  email?: string | null
  size?: "sm" | "md"
}

function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^0-9]/g, "")
  if (digits.length < 10) return null
  return `https://wa.me/${digits}`
}

export default function CrmIntegrationStubButtons({
  phone,
  email,
  size = "sm",
}: CrmIntegrationStubButtonsProps) {
  const wa = whatsappLink(phone)
  const sizeCls =
    size === "sm" ? "h-7 w-7 text-[11px]" : "h-8 w-8 text-xs"

  return (
    <TooltipProvider delayDuration={200}>
      <div className="inline-flex items-center gap-1">
        <ActionLink
          href={phone ? `tel:${phone}` : null}
          icon={<Phone className="h-3.5 w-3.5" />}
          label={`Call · ${phone ?? "no phone"}`}
          providerHint="Dialer routes via OS today; Knowlarity / Ozonetel adapter lands in Phase 12."
          sizeCls={sizeCls}
        />
        <ActionLink
          href={wa}
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          label={wa ? "Open WhatsApp" : "WhatsApp · no phone"}
          providerHint="Opens wa.me today; WhatsApp Business adapter lands in Phase 12."
          sizeCls={sizeCls}
          accent="success"
        />
        <ActionLink
          href={phone ? `sms:${phone}` : null}
          icon={<MessageCircle className="h-3.5 w-3.5 rotate-180" />}
          label={phone ? "Send SMS" : "SMS · no phone"}
          providerHint="Opens OS SMS today; DLT-compliant SMS adapter lands in Phase 12."
          sizeCls={sizeCls}
        />
        <ActionLink
          href={email ? `mailto:${email}` : null}
          icon={<Mail className="h-3.5 w-3.5" />}
          label={email ? `Email · ${email}` : "Email · no address"}
          providerHint="Opens default mail client today; templated transactional email lands in Phase 12."
          sizeCls={sizeCls}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href="/admin-v2/comms"
              className={`inline-flex items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02] text-[var(--v2-text-faint)] transition-colors hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)] ${sizeCls}`}
              aria-label="Configure providers"
            >
              <Settings className="h-3.5 w-3.5" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Configure WhatsApp / SMS / Voice / Email providers (Phase 12).</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

interface ActionLinkProps {
  href: string | null
  icon: React.ReactNode
  label: string
  providerHint: string
  sizeCls: string
  accent?: "success" | "default"
}

function ActionLink({
  href,
  icon,
  label,
  providerHint,
  sizeCls,
  accent = "default",
}: ActionLinkProps) {
  const className = `inline-flex items-center justify-center rounded-md border transition-colors ${sizeCls} ${
    href
      ? accent === "success"
        ? "border-emerald-500/30 bg-emerald-500/10 text-[#5DF7BC] hover:bg-emerald-500/20"
        : "border-white/[0.08] bg-white/[0.03] text-[var(--v2-text-mute)] hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)]"
      : "cursor-not-allowed border-white/[0.04] bg-white/[0.01] text-[var(--v2-text-faint)] opacity-60"
  }`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={label}>
            {icon}
          </a>
        ) : (
          <span className={className} aria-label={label} aria-disabled="true">
            {icon}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        <p className="text-xs font-medium">{label}</p>
        <p className="mt-1 text-[11px] text-[var(--v2-text-mute)]">{providerHint}</p>
      </TooltipContent>
    </Tooltip>
  )
}
