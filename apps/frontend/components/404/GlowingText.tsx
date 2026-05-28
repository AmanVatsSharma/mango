"use client";

/**
 * GlowingText Component
 * 
 * Creates pulsing neon text with cyberpunk aesthetic and electric glow effects.
 * Features responsive typography and accessibility considerations.
 * 
 * Props:
 * @param {string} children - Text content to display with glow effect
 * @param {string} className - Additional CSS classes
 * @param {number} size - Text size variant ('small' | 'medium' | 'large')
 * 
 * Performance optimizations:
 * - Uses CSS text-shadow for GPU acceleration
 * - Respects prefers-reduced-motion
 * - Fluid typography using clamp() for responsive sizing
 * 
 * @component
 * @example
 * <GlowingText size="large">404</GlowingText>
 */

export interface GlowingTextProps {
  children: React.ReactNode;
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

export default function GlowingText({ children, className = '', size = 'medium' }: GlowingTextProps) {
  console.log('[GlowingText] Rendering text with glow effect', { size });

  // Responsive font sizes with clamp for fluid typography
  const sizeClasses = {
    small: 'text-3xl sm:text-4xl md:text-5xl',
    medium: 'text-5xl sm:text-6xl md:text-7xl lg:text-8xl',
    large: 'text-7xl sm:text-8xl md:text-9xl lg:text-[12rem]',
  };

  return (
    <div className="relative inline-block">
      {/* Main text with glow effect */}
      <h1 
        className={`font-bold tracking-tight ${sizeClasses[size]} ${className}`}
        style={{
          color: '#00D9FF',
          textShadow: `
            /* Outer glow layers for depth */
            0 0 10px rgba(0, 217, 255, 0.5),
            0 0 20px rgba(0, 217, 255, 0.4),
            0 0 30px rgba(0, 217, 255, 0.3),
            0 0 40px rgba(0, 217, 255, 0.2),
            /* Cyan accent */
            0 0 60px rgba(0, 255, 240, 0.15),
            /* Inner highlight */
            0 0 80px rgba(0, 217, 255, 0.1),
            /* Deep glow */
            0 0 100px rgba(0, 217, 255, 0.05)
          `,
          // Animation will be handled by CSS
          animation: 'textPulse 3s ease-in-out infinite',
        }}
      >
        {children}
      </h1>

      {/* Background blur for extra glow */}
      <div 
        className="absolute inset-0 -z-10 blur-2xl"
        style={{
          background: 'linear-gradient(135deg, #00D9FF, #00FFF0)',
          opacity: 0.3,
          animation: 'glowPulse 3s ease-in-out infinite',
        }}
      />

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes textPulse {
          0%, 100% {
            opacity: 1;
            filter: brightness(1);
          }
          50% {
            opacity: 0.9;
            filter: brightness(1.2);
          }
        }

        @keyframes glowPulse {
          0%, 100% {
            opacity: 0.2;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(1.1);
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation: none !important;
          }
        }

        /* Mobile optimization - reduce animation intensity */
        @media (max-width: 768px) {
          @keyframes textPulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.95;
            }
          }
        }
      `}</style>
    </div>
  );
}

