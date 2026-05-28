-- Create RiskLimit table for risk management
CREATE TABLE IF NOT EXISTS "risk_limits" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "max_daily_loss" DECIMAL(18, 2) NOT NULL DEFAULT 0,
    "max_position_size" DECIMAL(18, 2) NOT NULL DEFAULT 0,
    "max_leverage" DECIMAL(10, 2) NOT NULL DEFAULT 1,
    "max_daily_trades" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "risk_limits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "risk_limits_user_id_key" ON "risk_limits"("user_id");
CREATE INDEX IF NOT EXISTS "risk_limits_user_id_idx" ON "risk_limits"("user_id");
CREATE INDEX IF NOT EXISTS "risk_limits_status_idx" ON "risk_limits"("status");

-- Create RiskAlert table for risk alerts
CREATE TABLE IF NOT EXISTS "risk_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "risk_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "risk_alerts_user_id_idx" ON "risk_alerts"("user_id");
CREATE INDEX IF NOT EXISTS "risk_alerts_type_idx" ON "risk_alerts"("type");
CREATE INDEX IF NOT EXISTS "risk_alerts_severity_idx" ON "risk_alerts"("severity");
CREATE INDEX IF NOT EXISTS "risk_alerts_resolved_idx" ON "risk_alerts"("resolved");
CREATE INDEX IF NOT EXISTS "risk_alerts_created_at_idx" ON "risk_alerts"("created_at");

-- Create Notification table for system notifications
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "target" TEXT NOT NULL DEFAULT 'ALL',
    "target_user_ids" TEXT[],
    "expires_at" TIMESTAMP(3),
    "read_by" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications"("type");
CREATE INDEX IF NOT EXISTS "notifications_priority_idx" ON "notifications"("priority");
CREATE INDEX IF NOT EXISTS "notifications_target_idx" ON "notifications"("target");
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications"("created_at");
CREATE INDEX IF NOT EXISTS "notifications_expires_at_idx" ON "notifications"("expires_at");

-- Add foreign key constraints
ALTER TABLE "risk_limits" ADD CONSTRAINT "risk_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_alerts" ADD CONSTRAINT "risk_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_alerts" ADD CONSTRAINT "risk_alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
