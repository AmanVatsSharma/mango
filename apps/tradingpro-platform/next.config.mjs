/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output produces a small self-contained server tree under
  // .next/standalone — used by TradeBazaar/Dockerfile to ship a tiny runtime
  // image and shave seconds off container cold-start.
  output: 'standalone',
  experimental: {
    optimizeCss: true,
    // Tree-shake heavy packages so each page only ships symbols it imports.
    // framer-motion, recharts, date-fns, and the radix surface area are the
    // measurable wins: framer-motion alone is ~50 KB gz when imported widely
    // without this hint.
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'recharts',
      'date-fns',
      'react-day-picker',
      '@radix-ui/react-accordion',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
    ],
  },
  webpack: (config, { isServer }) => {
    // Ensure generated files importing '.prisma/client' resolve at build time
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '.prisma/client': '@prisma/client',
    }
    // ioredis uses Node.js built-ins (dns, net, tls, fs) — only bundle on server
    if (!isServer) {
      config.externals = config.externals || []
      if (Array.isArray(config.externals)) {
        config.externals.push('ioredis')
      }
    }
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      dns: false,
      net: false,
      tls: false,
      fs: false,
    }
    return config
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/v0/b/theaweshop.appspot.com/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'financialmodelingprep.com',
        port: '',
        pathname: '/image-stock/**',
      },
    ]
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Allow CORS origins for NextAuth and API routes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.ALLOWED_ORIGINS || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Origin, X-Requested-With, Content-Type, Accept, Authorization' },
          { key: 'Vary', value: 'Origin' },
        ],
      },
    ];
  },
  async redirects() {
    const normalizeSlug = (value) => (value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")

    const activeBrandSlug = normalizeSlug(process.env.NEXT_PUBLIC_BRAND_SLUG || process.env.BRAND_SLUG || "")
    if (!activeBrandSlug) {
      return []
    }
    const legacyBrandSlugs = String(process.env.BRAND_LEGACY_SLUGS || "tradebazaar")
      .split(",")
      .map(normalizeSlug)
      .filter((slug, index, list) => slug && slug !== activeBrandSlug && list.indexOf(slug) === index)

    return legacyBrandSlugs.map((slug) => ({
      source: `/why-${slug}`,
      destination: `/why-${activeBrandSlug}`,
      permanent: true,
    }))
  },
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*',
    // Maintenance mode environment variables
    MAINTENANCE_MODE: process.env.MAINTENANCE_MODE || 'false',
    MAINTENANCE_MESSAGE: process.env.MAINTENANCE_MESSAGE,
    MAINTENANCE_END_TIME: process.env.MAINTENANCE_END_TIME,
    MAINTENANCE_ALLOW_ADMIN_BYPASS: process.env.MAINTENANCE_ALLOW_ADMIN_BYPASS || 'true',
    // Marketing site banner (public marketing pages)
    SITE_BANNER_ENABLED: process.env.SITE_BANNER_ENABLED || 'true',
    SITE_BANNER_TITLE: process.env.SITE_BANNER_TITLE,
    SITE_BANNER_MESSAGE: process.env.SITE_BANNER_MESSAGE,
    // Joinchat-like widget (public marketing pages)
    CHAT_WIDGET_ENABLED: process.env.CHAT_WIDGET_ENABLED || 'true',
    CHAT_WIDGET_TITLE: process.env.CHAT_WIDGET_TITLE,
    CHAT_WIDGET_MESSAGE: process.env.CHAT_WIDGET_MESSAGE,
    CHAT_WIDGET_CTA_LABEL: process.env.CHAT_WIDGET_CTA_LABEL,
    CHAT_WIDGET_CTA_HREF: process.env.CHAT_WIDGET_CTA_HREF || '/contact',
  },
};
export default nextConfig;

