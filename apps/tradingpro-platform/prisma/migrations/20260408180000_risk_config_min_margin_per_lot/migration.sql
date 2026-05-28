-- Optional INR floor per lot for short-option margin (RiskConfig).
ALTER TABLE "risk_config" ADD COLUMN "min_margin_per_lot" DECIMAL(18,2);
