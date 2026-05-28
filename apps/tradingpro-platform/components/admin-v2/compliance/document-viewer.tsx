/**
 * @file components/admin-v2/compliance/document-viewer.tsx
 * @module admin-v2/compliance
 * @description KYC document viewer — image with zoom/pan/rotate via react-zoom-pan-pinch,
 *              PDF via iframe. Side-by-side compare slot for placing two documents next to
 *              each other (PAN vs Aadhaar, etc.).
 *
 *              Exports:
 *                - DocumentViewer        — single document.
 *                - DocumentSideBySide    — two viewers in a 2-column grid.
 *
 *              Side-effects: none (display only; URL provider is the caller's responsibility).
 *
 *              Key invariants:
 *                - Image / PDF detection is by URL extension. Unknown types fall back to "open
 *                  in new tab" rather than guessing.
 *                - Controls (zoom in/out/reset, rotate, open external) are always visible —
 *                  reviewers should never have to hunt for them.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import {
  ExternalLink,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch"
import { cn } from "@/lib/utils"

interface DocumentViewerProps {
  url: string | null | undefined
  label: string
  className?: string
}

function detectKind(url: string | null | undefined): "image" | "pdf" | "unknown" {
  if (!url) return "unknown"
  const lower = url.split("?")[0].toLowerCase()
  if (/\.(png|jpe?g|webp|gif|bmp|svg)$/.test(lower)) return "image"
  if (/\.pdf$/.test(lower)) return "pdf"
  return "unknown"
}

export function DocumentViewer({ url, label, className }: DocumentViewerProps) {
  const kind = detectKind(url)
  const [rotation, setRotation] = React.useState(0)

  return (
    <div
      className={cn(
        "v2-card relative flex flex-col overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
          {label}
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[var(--v2-info)] hover:underline"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      <div className="relative h-72 bg-black/40">
        {!url ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--v2-text-mute)]">
            No document
          </div>
        ) : kind === "pdf" ? (
          <iframe
            title={label}
            src={url}
            className="h-full w-full"
            style={{ borderWidth: 0 }}
          />
        ) : kind === "image" ? (
          <TransformWrapper
            initialScale={1}
            minScale={0.4}
            maxScale={6}
            doubleClick={{ disabled: false, mode: "toggle" }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div className="absolute right-2 top-2 z-10 flex gap-1">
                  <ToolbarBtn onClick={() => zoomIn()} aria-label="Zoom in">
                    <ZoomIn className="h-3.5 w-3.5" />
                  </ToolbarBtn>
                  <ToolbarBtn onClick={() => zoomOut()} aria-label="Zoom out">
                    <ZoomOut className="h-3.5 w-3.5" />
                  </ToolbarBtn>
                  <ToolbarBtn
                    onClick={() => setRotation((r) => (r - 90) % 360)}
                    aria-label="Rotate left"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </ToolbarBtn>
                  <ToolbarBtn
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    aria-label="Rotate right"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </ToolbarBtn>
                  <ToolbarBtn
                    onClick={() => {
                      resetTransform()
                      setRotation(0)
                    }}
                    aria-label="Reset"
                  >
                    Reset
                  </ToolbarBtn>
                </div>
                <TransformComponent wrapperClass="!h-full !w-full" contentClass="!h-full !w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={label}
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      maxHeight: "100%",
                      maxWidth: "100%",
                      objectFit: "contain",
                    }}
                  />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--v2-text-mute)]">
            Unknown document type — use Open to view in a new tab.
          </div>
        )}
      </div>
    </div>
  )
}

function ToolbarBtn({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className="rounded-md border border-white/[0.1] bg-black/60 px-2 py-1 text-[11px] font-medium text-white backdrop-blur transition-colors hover:bg-black/80"
    >
      {children}
    </button>
  )
}

interface DocumentSideBySideProps {
  left: { url: string | null | undefined; label: string }
  right: { url: string | null | undefined; label: string }
}

export function DocumentSideBySide({ left, right }: DocumentSideBySideProps) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <DocumentViewer url={left.url} label={left.label} />
      <DocumentViewer url={right.url} label={right.label} />
    </div>
  )
}
