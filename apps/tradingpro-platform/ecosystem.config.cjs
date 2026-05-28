/**
 * PM2 ecosystem for TradingPro on the same host as TradeBazaar.
 * TradeBazaar: Next 3000, terminal-gateway 3001 — keep those free on this machine.
 * TradingPro: Next 4000, terminal-gateway 4001 (same +1 pattern).
 *
 * Adjust `cwd` to your actual deploy path on EC2 before `pm2 start ecosystem.config.cjs`.
 */
module.exports = {
  apps: [
    {
      name: "tpro-web",
      cwd: "/home/ubuntu/tradingpro-platform",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 4000",
      exec_mode: "cluster",
      instances: 2,
      env: {
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: "4000",
      },
      max_memory_restart: "800M",
      time: true,
      kill_timeout: 10000,
    },
    {
      name: "tpro-order-worker",
      cwd: "/home/ubuntu/tradingpro-platform",
      script: "/home/ubuntu/.bun/bin/bun",
      args: "run scripts/order-worker.ts",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        ORDER_WORKER_INTERVAL_MS: "750",
        ORDER_WORKER_BATCH_LIMIT: "50",
      },
      max_memory_restart: "500M",
      time: true,
    },
    {
      name: "tpro-position-pnl-worker",
      cwd: "/home/ubuntu/tradingpro-platform",
      script: "/home/ubuntu/.bun/bin/bun",
      args: "run scripts/position-pnl-worker.ts",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        POSITION_PNL_WORKER_INTERVAL_MS: "3000",
        POSITION_PNL_WORKER_BATCH_LIMIT: "500",
        POSITION_PNL_UPDATE_THRESHOLD: "1",
      },
      max_memory_restart: "500M",
      time: true,
    },
  ],
};
