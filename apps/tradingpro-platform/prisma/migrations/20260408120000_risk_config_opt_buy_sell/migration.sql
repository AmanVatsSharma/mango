-- Optional NFO/MCX option BUY vs SELL margin rows (idempotent). Same default leverage as generic NRML_OPT until admin tunes.

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'NFO', 'NRML_OPT_BUY', 100, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'NFO' AND c.product_type = 'NRML_OPT_BUY');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'NFO', 'NRML_OPT_SELL', 100, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'NFO' AND c.product_type = 'NRML_OPT_SELL');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'NFO', 'MIS_OPT_BUY', 100, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'NFO' AND c.product_type = 'MIS_OPT_BUY');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'NFO', 'MIS_OPT_SELL', 100, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'NFO' AND c.product_type = 'MIS_OPT_SELL');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'MCX', 'NRML_OPT_BUY', 50, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'MCX' AND c.product_type = 'NRML_OPT_BUY');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'MCX', 'NRML_OPT_SELL', 50, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'MCX' AND c.product_type = 'NRML_OPT_SELL');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'MCX', 'MIS_OPT_BUY', 50, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'MCX' AND c.product_type = 'MIS_OPT_BUY');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'MCX', 'MIS_OPT_SELL', 50, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'MCX' AND c.product_type = 'MIS_OPT_SELL');
