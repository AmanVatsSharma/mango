-- BSE equity + NFO NRML seeds aligned with watchlist/search segments (idempotent).

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'BSE', 'MIS', 200, NULL, 0.0003, 20, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'BSE' AND c.product_type = 'MIS');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'BSE', 'CNC', 50, NULL, 0.0003, 20, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'BSE' AND c.product_type = 'CNC');

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
SELECT 'NFO', 'NRML', 100, 20, NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM risk_config c WHERE c.segment = 'NFO' AND c.product_type = 'NRML');
