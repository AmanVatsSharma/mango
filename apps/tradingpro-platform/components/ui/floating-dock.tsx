/**
 * File:        components/ui/floating-dock.tsx
 * Module:      UI · Animated Navigation
 * Purpose:     macOS Dock-style magnifying nav bar with full touch support for mobile;
 *              icons spring-scale based on cursor/finger proximity using Framer Motion.
 *
 * Exports:
 *   - FloatingDock({ items, desktopClassName, mobileClassName, activeHref, onSelect }) — combined dock (desktop + mobile popup)
 *   - FloatingDockDesktop({ items, className, activeHref, onSelect }) — magnifying row, touch-aware, renders at all breakpoints
 *   - FloatingDockMobile({ items, className, activeHref, onSelect }) — hamburger popup fallback for xs screens
 *   - DockItem — item shape type
 *
 * Depends on:
 *   - framer-motion — MotionValue, spring transforms, AnimatePresence
 *   - @/lib/utils — cn()
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Touch feeds the same mouseX MotionValue as hover — identical spring physics on mobile
 *   - onTouchEnd finds the nearest icon by getBoundingClientRect and fires onSelect after 150ms
 *     so the spring deflation animates before navigation
 *   - onRefMount callback gives FloatingDockDesktop a live HTMLDivElement slot for each icon
 *     without needing forwardRef (avoids framer-motion ref-merging complexity)
 *
 * Read order:
 *   1. DockItem — data shape
 *   2. FloatingDockDesktop — core magnification + touch logic
 *   3. IconContainer — per-icon spring math and active state
 *   4. FloatingDockMobile — hamburger popup fallback
 *   5. FloatingDock — composed export
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-09
 */

"use client";

import { cn } from "@/lib/utils";
import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { Menu } from "lucide-react";
import { useRef, useState } from "react";

export interface DockItem {
  title: string;
  icon: React.ReactNode;
  href: string;
}

// ─── Composed export ─────────────────────────────────────────────────────────

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
  activeHref,
  onSelect,
}: {
  items: DockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
  activeHref?: string;
  onSelect?: (href: string) => void;
}) => (
  <>
    <FloatingDockDesktop
      items={items}
      className={desktopClassName}
      activeHref={activeHref}
      onSelect={onSelect}
    />
    <FloatingDockMobile
      items={items}
      className={mobileClassName}
      activeHref={activeHref}
      onSelect={onSelect}
    />
  </>
);

// ─── Desktop magnifying row (also touch-aware) ────────────────────────────────

export const FloatingDockDesktop = ({
  items,
  className,
  activeHref,
  onSelect,
  fabIndex,
}: {
  items: DockItem[];
  className?: string;
  activeHref?: string;
  onSelect?: (href: string) => void;
  /** Index of the item that renders as a floating center FAB. Defaults to the middle item. */
  fabIndex?: number;
}) => {
  const resolvedFabIndex = fabIndex ?? Math.floor(items.length / 2);
  const mouseX = useMotionValue(Infinity);
  // Parallel array of icon container elements — used by touchend to find nearest icon
  const itemEls = useRef<(HTMLDivElement | null)[]>([]);
  const lastTouchX = useRef<number>(Infinity);

  const handleTouchEnd = () => {
    const tx = lastTouchX.current;
    let closestIdx = -1;
    let closestDist = 80; // ignore touches further than 80px from any icon center
    itemEls.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(center - tx);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });
    mouseX.set(Infinity);
    if (closestIdx >= 0 && items[closestIdx]) {
      const href = items[closestIdx].href;
      // Delay 150ms so the deflation spring plays before navigation
      setTimeout(() => onSelect?.(href), 150);
    }
  };

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      onTouchMove={(e) => {
        lastTouchX.current = e.touches[0].pageX;
        mouseX.set(e.touches[0].pageX);
      }}
      onTouchEnd={handleTouchEnd}
      className={cn(
        "mx-auto flex w-full h-16 items-center justify-around overflow-visible rounded-2xl bg-gray-50 px-2 dark:bg-neutral-900",
        className,
      )}
    >
      {items.map((item, i) => (
        <IconContainer
          key={item.title}
          mouseX={mouseX}
          isActive={activeHref === item.href}
          isFab={i === resolvedFabIndex}
          onSelect={onSelect}
          onRefMount={(el) => { itemEls.current[i] = el; }}
          {...item}
        />
      ))}
    </motion.div>
  );
};

// ─── Mobile hamburger popup ───────────────────────────────────────────────────

export const FloatingDockMobile = ({
  items,
  className,
  activeHref,
  onSelect,
}: {
  items: DockItem[];
  className?: string;
  activeHref?: string;
  onSelect?: (href: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative block md:hidden", className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            layoutId="nav"
            className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-2"
          >
            {items.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: 10,
                  transition: { delay: idx * 0.05 },
                }}
                transition={{ delay: (items.length - 1 - idx) * 0.05 }}
              >
                <button
                  onClick={() => {
                    setOpen(false);
                    onSelect?.(item.href);
                  }}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full",
                    activeHref === item.href
                      ? "bg-primary text-primary-foreground"
                      : "bg-gray-50 dark:bg-neutral-900",
                  )}
                >
                  <div className="h-4 w-4">{item.icon}</div>
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 dark:bg-neutral-800"
      >
        <Menu className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
      </button>
    </div>
  );
};

// ─── Per-icon container with spring magnification ─────────────────────────────

function IconContainer({
  mouseX,
  title,
  icon,
  href,
  isActive,
  isFab,
  onSelect,
  onRefMount,
}: {
  mouseX: MotionValue<number>;
  title: string;
  icon: React.ReactNode;
  href: string;
  isActive?: boolean;
  isFab?: boolean;
  onSelect?: (href: string) => void;
  onRefMount?: (el: HTMLDivElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  // FAB starts larger and magnifies less aggressively so it stays visually distinct
  const [minSize, maxSize] = isFab ? [52, 64] : [40, 80];
  const [minIcon, maxIcon] = isFab ? [26, 32] : [20, 40];

  const widthTransform = useTransform(distance, [-150, 0, 150], [minSize, maxSize, minSize]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [minSize, maxSize, minSize]);
  const widthTransformIcon = useTransform(distance, [-150, 0, 150], [minIcon, maxIcon, minIcon]);
  const heightTransformIcon = useTransform(distance, [-150, 0, 150], [minIcon, maxIcon, minIcon]);

  const springCfg = { mass: 0.1, stiffness: 150, damping: 12 };
  const width = useSpring(widthTransform, springCfg);
  const height = useSpring(heightTransform, springCfg);
  const widthIcon = useSpring(widthTransformIcon, springCfg);
  const heightIcon = useSpring(heightTransformIcon, springCfg);

  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onSelect?.(href)}
      className={cn(
        "flex-1 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full",
        isFab && "-translate-y-4",
      )}
      aria-label={title}
    >
      <motion.div
        ref={(el) => {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
          onRefMount?.(el);
        }}
        style={{ width, height }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "relative flex aspect-square items-center justify-center rounded-full",
          isFab
            ? cn(
                "shadow-xl transition-shadow duration-300",
                isActive
                  ? "bg-gradient-to-br from-primary via-primary to-primary/80 shadow-primary/40"
                  : "bg-gradient-to-br from-primary/95 to-primary/70 shadow-primary/20",
              )
            : cn(
                "transition-colors duration-200",
                isActive
                  ? "bg-primary/20 ring-2 ring-primary/50 dark:bg-primary/30"
                  : "bg-gray-200 dark:bg-neutral-800",
              ),
        )}
      >
        {/* FAB glow bloom */}
        {isFab && (
          <span
            className={cn(
              "absolute -inset-[2px] rounded-full blur-md transition-opacity duration-500",
              isActive ? "opacity-60" : "opacity-25",
            )}
            style={{ background: "color-mix(in oklab, var(--primary), transparent 60%)" }}
          />
        )}

        {/* FAB spinning active ring */}
        {isFab && isActive && (
          <span
            className="absolute -inset-[3px] rounded-full animate-spin pointer-events-none"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0%, transparent 48%, color-mix(in oklab, var(--primary), transparent 70%) 60%, var(--primary) 75%, var(--primary) 83%, color-mix(in oklab, var(--primary), transparent 70%) 93%, transparent 100%)",
              animationDuration: "2.2s",
            }}
          />
        )}

        {/* Tooltip — desktop hover only */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 2, x: "-50%" }}
              className="absolute -top-8 left-1/2 w-fit rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs whitespace-pre text-neutral-700 dark:border-neutral-900 dark:bg-neutral-800 dark:text-white pointer-events-none"
            >
              {title}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Icon */}
        <motion.div
          style={{ width: widthIcon, height: heightIcon }}
          className={cn(
            "relative z-10 flex items-center justify-center",
            isFab
              ? "text-primary-foreground"
              : isActive
                ? "text-primary"
                : "text-neutral-600 dark:text-neutral-300",
          )}
        >
          {icon}
        </motion.div>

        {/* Active dot — flat tabs only */}
        {!isFab && isActive && (
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
        )}
      </motion.div>
    </button>
  );
}
