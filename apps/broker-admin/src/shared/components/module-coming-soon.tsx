/**
 * File:        apps/broker-admin/src/shared/components/module-coming-soon.tsx
 * Module:      broker-admin · Shared UI
 * Purpose:     Placeholder for Phase 2/3 modules — shows title, subtitle, and skeleton loaders
 *
 * Exports:
 *   - ModuleComingSoon({ title, subtitle, features }) — server-safe component
 *
 * Side-effects:
 *   - none
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

interface ModuleComingSoonProps {
  title: string;
  subtitle: string;
  features?: string[];
}

export function ModuleComingSoon({ title, subtitle, features = [] }: ModuleComingSoonProps) {
  return (
    <div className="p-6">
      {/* Module header */}
      <div className="mb-6">
        <h1 className="font-display text-[13px] font-semibold tracking-[0.08em] text-fg1 uppercase">
          {title}
        </h1>
        <p className="mt-1 font-ui text-[12px] text-fg3">{subtitle}</p>
      </div>

      {/* Coming soon card */}
      <div className="rounded-r-lg border border-[var(--border)] bg-[var(--bg-panel)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-r-lg border border-[var(--border-md)] bg-[var(--bg-elevated)]">
          <span className="font-display text-xl text-fg3">⊡</span>
        </div>
        <div className="mb-1 font-display text-[13px] font-semibold tracking-[0.06em] text-fg2 uppercase">
          {title}
        </div>
        <div className="mb-6 font-ui text-[12px] text-fg3">
          Phase 2 build — shell, design system, and mock data are all wired.
        </div>

        {/* Feature list */}
        {features.length > 0 && (
          <ul className="mb-8 inline-flex flex-col gap-1.5 text-left">
            {features.map(f => (
              <li key={f} className="flex items-center gap-2 font-ui text-[12px] text-fg3">
                <span className="h-1 w-1 rounded-full bg-accent" />
                {f}
              </li>
            ))}
          </ul>
        )}

        {/* Skeleton loaders */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            {[200, 160, 140, 180].map(w => (
              <div
                key={w}
                className="h-8 animate-pulse rounded-r-md bg-[var(--bg-elevated)]"
                style={{ width: w }}
              />
            ))}
          </div>
          <div className="h-px bg-[var(--border)]" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex gap-3">
              {[120, 200, 100, 140, 80].map((w, j) => (
                <div
                  key={j}
                  className="h-6 animate-pulse rounded bg-[var(--bg-elevated)]"
                  style={{ width: w, animationDelay: `${i * 80 + j * 40}ms` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
