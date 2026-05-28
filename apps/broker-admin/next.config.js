/**
 * File:        apps/broker-admin/next.config.js
 * Module:      broker-admin · Build Config
 * Purpose:     Next.js configuration for Broker Admin app — NX plugin + obsidian-ui transpile.
 *              When STATIC_EXPORT=true, switches to static export mode (no rewrites,
 *              unoptimized images) so the app can be deployed as plain HTML/CSS/JS.
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - transpilePackages required for @obsidian/obsidian-ui (ESM lib)
 *   - API rewrites proxy to backend at :3000 — disabled in static export mode
 *   - STATIC_EXPORT=true → output:'export', images.unoptimized, trailingSlash:true
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-26
 */

//@ts-check
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

const isStaticExport = process.env.STATIC_EXPORT === 'true';

/** @type {import('@nx/next/plugins/with-nx').WithNxOptions} */
const nextConfig = {
  nx: {},
  transpilePackages: ['@obsidian/obsidian-ui'],
  allowedDevOrigins: ['http://localhost:4500', '*.localhost', '*.lvh.me'],

  // Static export mode — active when STATIC_EXPORT=true
  ...(isStaticExport
    ? {
        output: 'export',
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: 'http://localhost:3000/:path*',
            },
          ];
        },
      }),
};

const plugins = [withNx];

module.exports = composePlugins(...plugins)(nextConfig);
