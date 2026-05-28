/**
 * File:        lib/comms/template-render.ts
 * Module:      Comms · Template Render
 * Purpose:     Variable extraction, validation, and substitution for comms templates.
 *
 * Exports:
 *   - extractVariableNames(body) → string[] — unique variable names declared in `body`
 *   - validateTemplate({ body, declared }) → void (throws TemplateValidationError)
 *                              — enforces that every `{{var}}` in body is in declared[]
 *                              — and every declared var appears at least once in body.
 *   - renderBody(body, vars) → { rendered: string, used: VariableMap, unresolved: string[] }
 *                              — substitutes; null/undefined → "". `unresolved` lists
 *                              any var present in body but missing from `vars`.
 *
 * Depends on:
 *   - ./types — TEMPLATE_VAR_REGEX, TemplateValidationError, VariableMap
 *
 * Side-effects:  none (pure functions)
 *
 * Key invariants:
 *   - The regex is shared with extraction so save-time validation matches send-time
 *     behaviour exactly. Never use a different parser.
 *   - validateTemplate is called at TEMPLATE SAVE — if it throws at SEND time, the
 *     send-router converts it to status=REJECTED.
 *
 * Read order:
 *   1. extractVariableNames — the parser
 *   2. validateTemplate — the SAVE-time gate (Gate #3 in Phase 12 schema header)
 *   3. renderBody — the SEND-time substituter
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import {
  TEMPLATE_VAR_REGEX,
  TemplateValidationError,
  type VariableMap,
} from "./types"

export function extractVariableNames(body: string): string[] {
  const names = new Set<string>()
  const matches = Array.from(body.matchAll(TEMPLATE_VAR_REGEX))
  for (const m of matches) {
    if (m[1]) names.add(m[1])
  }
  return Array.from(names).sort()
}

export function validateTemplate(input: {
  body: string
  declared: string[]
}): void {
  const inBody = new Set(extractVariableNames(input.body))
  const declared = new Set(input.declared)

  const missingInBody = Array.from(declared).filter((name) => !inBody.has(name))
  const undeclaredInBody = Array.from(inBody).filter((name) => !declared.has(name))

  if (missingInBody.length === 0 && undeclaredInBody.length === 0) return

  const parts: string[] = []
  if (undeclaredInBody.length) {
    parts.push(`body uses undeclared variables: ${undeclaredInBody.join(", ")}`)
  }
  if (missingInBody.length) {
    parts.push(
      `declared variables not used in body: ${missingInBody.join(", ")}`,
    )
  }
  throw new TemplateValidationError(
    `template validation failed — ${parts.join("; ")}`,
    missingInBody,
    undeclaredInBody,
  )
}

export function renderBody(
  body: string,
  vars: VariableMap,
): { rendered: string; used: VariableMap; unresolved: string[] } {
  const used: VariableMap = {}
  const unresolved: string[] = []

  const rendered = body.replace(TEMPLATE_VAR_REGEX, (_match, rawName: string) => {
    const name = rawName as string
    const raw = vars[name]
    if (raw === undefined) {
      unresolved.push(name)
      used[name] = ""
      return ""
    }
    const value = raw === null ? "" : String(raw)
    used[name] = value
    return value
  })

  return { rendered, used, unresolved }
}
