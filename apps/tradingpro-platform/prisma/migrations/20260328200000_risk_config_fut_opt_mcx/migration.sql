-- Optional NFO/MCX split rows for futures vs options (idempotent). Tune leverage in admin after apply.

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'NFO', 'NRML_FUT', 100, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'NFO' AND c.product_type = 'NRML_FUT');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'NFO', 'NRML_OPT', 100, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'NFO' AND c.product_type = 'NRML_OPT');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'MCX', 'NRML', 50, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'MCX' AND c.product_type = 'NRML');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'MCX', 'NRML_FUT', 50, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'MCX' AND c.product_type = 'NRML_FUT');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'MCX', 'NRML_OPT', 50, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'MCX' AND c.product_type = 'NRML_OPT');
