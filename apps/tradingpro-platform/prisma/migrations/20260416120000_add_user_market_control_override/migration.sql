-- CreateTable
CREATE TABLE "user_market_control_overrides" (
    "user_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "spread_mult" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "slip_mult" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "anti_scalp_relaxed" BOOLEAN NOT NULL DEFAULT false,
    "force_worst_fill" BOOLEAN NOT NULL DEFAULT false,
    "margin_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "tilt_bias_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "set_by_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_market_control_overrides_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "user_market_control_overrides_enabled_expires_at_idx" ON "user_market_control_overrides"("enabled", "expires_at");

-- AddForeignKey
ALTER TABLE "user_market_control_overrides" ADD CONSTRAINT "user_market_control_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
