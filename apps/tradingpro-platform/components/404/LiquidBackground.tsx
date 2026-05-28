"use client";

/**
 * LiquidBackground Component
 * 
 * Creates a futuristic animated background with liquid metallic flows
 * featuring electric blue/cyan glows on deep black background.
 * 
 * Performance optimizations:
 * - Uses CSS animations (GPU-accelerated)
 * - Multiple layered gradients for depth
 * - Reduced motion support for accessibility
 * - Optimized for 60fps on mobile devices
 * 
 * @component
 * @example
 * <LiquidBackground />
 */
export default function LiquidBackground() {
  console.log('[LiquidBackground] Component mounted - rendering animated background');

  return (
    <div className="fixed inset-0 bg-black overflow-hidden pointer-events-none">
      {/* Layer 1: Base liquid flow - electric blue */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          background: `
            radial-gradient(circle at 20% 50%, #00D9FF 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, #00FFF0 0%, transparent 50%),
            radial-gradient(circle at 50% 20%, #0080FF 0%, transparent 50%)
          `,
          animation: 'liquidFlow 15s ease-in-out infinite',
          willChange: 'transform',
        }}
      />

      {/* Layer 2: Secondary liquid flow - cyan with purple accent */}
      <div 
        className="absolute inset-0 opacity-15"
        style={{
          background: `
            radial-gradient(circle at 70% 30%, #00FFF0 0%, transparent 50%),
            radial-gradient(circle at 30% 70%, #00D9FF 0%, transparent 50%),
            radial-gradient(circle at 60% 90%, #8B5CF6 0%, transparent 50%)
          `,
          animation: 'liquidFlow 20s ease-in-out infinite reverse',
          willChange: 'transform',
        }}
      />

      {/* Layer 3: Tertiary layer - subtle purple accents */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          background: `
            radial-gradient(circle at 50% 50%, #8B5CF6 0%, transparent 60%),
            radial-gradient(circle at 10% 90%, #00D9FF 0%, transparent 50%)
          `,
          animation: 'liquidFlow 25s ease-in-out infinite',
          willChange: 'transform',
        }}
      />

      {/* Layer 4: Slow rotating glow layer */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          background: 'radial-gradient(circle at center, #00FFF0 0%, transparent 70%)',
          animation: 'liquidRotate 30s linear infinite',
          willChange: 'transform',
        }}
      />

      {/* Animated grid overlay for tech aesthetic */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 217, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 217, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'liquidFlow 40s ease-in-out infinite',
        }}
      />

      {/* CSS Keyframes for animations */}
      <style jsx>{`
        @keyframes liquidFlow {
          0%, 100% {
            transform: translate(0%, 0%) scale(1) rotate(0deg);
          }
          25% {
            transform: translate(5%, 3%) scale(1.1) rotate(5deg);
          }
          50% {
            transform: translate(-3%, 2%) scale(0.95) rotate(-5deg);
          }
          75% {
            transform: translate(2%, -2%) scale(1.05) rotate(3deg);
          }
        }

        @keyframes liquidRotate {
          0% {
            transform: rotate(0deg) scale(1);
          }
          100% {
            transform: rotate(360deg) scale(1.2);
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation: none !important;
            transition: none !important;
          }
        }

        /* Mobile optimization */
        @media (max-width: 768px) {
          @keyframes liquidFlow {
            0%, 100% {
              transform: translate(0%, 0%) scale(1);
            }
            50% {
              transform: translate(2%, 2%) scale(1.05);
            }
          }
        }
      `}</style>
    </div>
  );
}

