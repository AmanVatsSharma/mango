/**
 * PM2 ecosystem for StockTrade (EC2 Mumbai).
 * Primary web app on port 4000, workers for order execution and position PnL.
 *
 * @author StockTrade
 * @created 2026-05-12
 */
module.exports = {
  apps: [
    {
      name: "stocktrade-web",
      cwd: "/home/ubuntu/stocktrade",
      script: "node_modules/.bin/next",
      args: "start -p 4000",
      exec_mode: "fork",
      instances: 1,
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
      name: "stocktrade-order-worker",
      cwd: "/home/ubuntu/stocktrade",
      script: "node_modules/.bin/tsx",
      args: "scripts/order-worker.ts",
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
      name: "stocktrade-position-pnl-worker",
      cwd: "/home/ubuntu/stocktrade",
      script: "node_modules/.bin/tsx",
      args: "scripts/position-pnl-worker.ts",
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
}