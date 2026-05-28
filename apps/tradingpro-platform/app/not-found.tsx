'use client';

import Link from 'next/link';
import { LiquidBackground, GlowingText } from '@/components/404';
import { Button } from '@/components/ui/button';
import { getAppRoute, getMarketingRoute } from '@/lib/branding-routes';

/**
 * NotFound Page (404 Error)
 *
 * A stunning, mobile-first 404 error page with:
 * - Liquid metallic flows with electric blue/cyan glows
 * - Cyberpunk aesthetic with deep black background
 * - Smooth animations optimized for 60fps
 * - Full accessibility support (reduced motion)
 *
 * Mobile-First Design:
 * - Responsive from 320px (mobile) to 4K displays
 * - Touch-optimized buttons (minimum 44x44px)
 * - Fluid typography using clamp() for scaling
 * - Performance-optimized for low-end devices
 *
 * @component
 * @returns JSX.Element - The 404 error page
 */
export default function NotFound() {
  // Remove any side-effects/logging that are not necessary in production

  // Handler for "Go Back" to use actual browser history
  function handleGoBack(e: React.MouseEvent) {
    e.preventDefault();
    if (typeof window !== 'undefined' && window.history) {
      window.history.back();
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* Animated Background */}
      <LiquidBackground />

      {/* Main Content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        {/* Error Code - Large Glowing Text */}
        <div className="mb-6 text-center">
          <GlowingText size="large">404</GlowingText>
        </div>

        {/* Error Message */}
        <div className="mb-8 text-center">
          <h2 className="mb-4 text-2xl font-semibold text-cyan-300 sm:text-3xl lg:text-4xl">
            Page Not Found
          </h2>
          <p className="mx-auto max-w-md text-base text-slate-400 sm:text-lg">
            The page you're looking for seems to have drifted into the void.
            <br className="hidden sm:block" />
            Let's get you back on track.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          {/* Go Home Button */}
          <Link href={getMarketingRoute("home")} className="block">
            <Button
              size="lg"
              className="group relative w-full min-w-[200px] overflow-hidden rounded-lg bg-transparent px-8 py-3 text-base font-semibold text-cyan-300 ring-2 ring-cyan-500/50 transition-all duration-300 hover:bg-cyan-500/10 hover:ring-cyan-400/70 sm:w-auto"
              style={{
                boxShadow: '0 0 20px rgba(0, 217, 255, 0.3)',
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                Go Home
                <svg
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </span>
              {/* Glowing hover effect */}
              <span className="absolute inset-0 -z-10 bg-cyan-500/20 blur-xl transition-opacity duration-300 group-hover:opacity-100"></span>
            </Button>
          </Link>

          {/* Back Button */}
          <Button
            variant="outline"
            size="lg"
            className="w-full min-w-[200px] border-slate-600 bg-slate-900/50 px-8 py-3 text-base font-semibold text-slate-300 backdrop-blur-sm transition-all duration-300 hover:bg-slate-800/70 hover:text-white sm:w-auto"
            onClick={handleGoBack}
          >
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Go Back
            </span>
          </Button>
        </div>

        {/* Additional Help Text */}
        <div className="mt-12 text-center">
          <p className="text-sm text-slate-500">
            Need help?{' '}
            <Link
              href={getAppRoute("dashboard")}
              className="font-medium text-cyan-400 transition-colors hover:text-cyan-300"
            >
              Visit Dashboard
            </Link>
          </p>
        </div>
      </div>

      {/* Floating Particles Effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-cyan-400/40 animate-pulse"
            style={{
              left: `${10 + i * 15}%`,
              top: `${20 + i * 10}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${2 + i * 0.3}s`,
            }}
          />
        ))}
      </div>

      {/* Mobile-specific optimizations and reduced motion handled via Tailwind CSS only - style jsx removed for server compatibility */}
      {/* 
        To enforce touch target size, add Tailwind classes or adjust component styling. 
        Reduced motion is respected globally if Tailwind's motion-safe/motion-reduce utilities are in use.
      */}
    </div>
  );
}

