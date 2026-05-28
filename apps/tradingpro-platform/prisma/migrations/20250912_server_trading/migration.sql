-- Idempotency and versioning
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE INDEX IF NOT EXISTS idx_orders_account_status_created ON orders ("tradingAccountId", status, "createdAt");

ALTER TABLE positions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_positions_account_symbol ON positions ("tradingAccountId", symbol);

ALTER TABLE trading_accounts ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_transactions_account_created ON transactions ("tradingAccountId", "createdAt");

-- Risk configuration
CREATE TABLE IF NOT EXISTS risk_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment text NOT NULL,
  product_type text NOT NULL,
  leverage numeric NOT NULL,
  brokerage_flat numeric,
  brokerage_rate numeric,
  brokerage_cap numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_risk_config_segment_product ON risk_config (segment, product_type) WHERE active;

-- Seed defaults
INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
VALUES
  ('NSE', 'MIS', 200, NULL, 0.0003, 20, true)
ON CONFLICT DO NOTHING;

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
VALUES
  ('NSE', 'CNC', 50, NULL, 0.0003, 20, true)
ON CONFLICT DO NOTHING;

INSERT INTO risk_config (segment, product_type, leverage, brokerage_flat, brokerage_rate, brokerage_cap, active)
VALUES
  ('NFO', 'DELIVERY', 100, 20, NULL, NULL, true)
ON CONFLICT DO NOTHING;

-- RPCs: funds operations (simplified; add RLS/ownership checks as needed)
CREATE OR REPLACE FUNCTION fn_block_margin(account_id uuid, p_amount numeric, p_idem_key text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE trading_accounts
  SET "availableMargin" = "availableMargin" - p_amount::int,
      "usedMargin" = "usedMargin" + p_amount::int,
      "updatedAt" = now()
  WHERE id = account_id;

  INSERT INTO transactions ("tradingAccountId", amount, type, description)
  VALUES (account_id, p_amount, 'DEBIT', 'BLOCK margin');
END;
$$;

CREATE OR REPLACE FUNCTION fn_release_margin(account_id uuid, p_amount numeric, p_idem_key text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE trading_accounts
  SET "availableMargin" = "availableMargin" + p_amount::int,
      "usedMargin" = "usedMargin" - p_amount::int,
      "updatedAt" = now()
  WHERE id = account_id;

  INSERT INTO transactions ("tradingAccountId", amount, type, description)
  VALUES (account_id, p_amount, 'CREDIT', 'RELEASE margin');
END;
$$;

CREATE OR REPLACE FUNCTION fn_debit(account_id uuid, p_amount numeric, p_desc text, p_idem_key text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE trading_accounts
  SET balance = balance - p_amount::int,
      "availableMargin" = "availableMargin" - p_amount::int,
      "updatedAt" = now()
  WHERE id = account_id;

  INSERT INTO transactions ("tradingAccountId", amount, type, description)
  VALUES (account_id, p_amount, 'DEBIT', COALESCE(p_desc, 'DEBIT'));
END;
$$;

CREATE OR REPLACE FUNCTION fn_credit(account_id uuid, p_amount numeric, p_desc text, p_idem_key text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE trading_accounts
  SET balance = balance + p_amount::int,
      "availableMargin" = "availableMargin" + p_amount::int,
      "updatedAt" = now()
  WHERE id = account_id;

  INSERT INTO transactions ("tradingAccountId", amount, type, description)
  VALUES (account_id, p_amount, 'CREDIT', COALESCE(p_desc, 'CREDIT'));
END;
$$;

-- NOTE: Higher-level fn_execute_order and fn_close_position will be added after testing funds RPCs.
-- Transactional order execution RPC
CREATE OR REPLACE FUNCTION fn_execute_order(
  p_order_id uuid,
  p_account_id uuid,
  p_symbol text,
  p_stock_id uuid,
  p_qty int,
  p_side text,
  p_price numeric,
  p_product_type text,
  p_segment text,
  p_total_charges numeric,
  p_required_margin numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_signed_qty int;
  v_existing_position positions%ROWTYPE;
  v_new_qty int;
  v_new_avg numeric;
BEGIN
  -- Funds first: block margin and debit charges
  PERFORM fn_block_margin(p_account_id, p_required_margin, p_order_id::text);
  PERFORM fn_debit(p_account_id, p_total_charges, 'BROKERAGE + TAXES', p_order_id::text);

  -- Upsert position
  v_signed_qty := CASE WHEN upper(p_side) = 'BUY' THEN p_qty ELSE -p_qty END;

  SELECT * INTO v_existing_position
  FROM positions
  WHERE "tradingAccountId" = p_account_id AND symbol = p_symbol
  FOR UPDATE;

  IF FOUND THEN
    v_new_qty := v_existing_position.quantity + v_signed_qty;
    IF v_new_qty = 0 THEN
      DELETE FROM positions WHERE id = v_existing_position.id;
    ELSE
      v_new_avg := ((v_existing_position."averagePrice" * abs(v_existing_position.quantity)) + (p_price * abs(v_signed_qty))) / (abs(v_existing_position.quantity) + abs(v_signed_qty));
      UPDATE positions
      SET quantity = v_new_qty,
          "averagePrice" = v_new_avg,
          "updatedAt" = now()
      WHERE id = v_existing_position.id;
    END IF;
  ELSE
    INSERT INTO positions (id, "tradingAccountId", symbol, quantity, "averagePrice", "createdAt", stockId)
    VALUES (gen_random_uuid(), p_account_id, p_symbol, v_signed_qty, p_price, now(), p_stock_id);
  END IF;

  -- Mark order executed
  UPDATE orders
  SET status = 'EXECUTED',
      "filledQuantity" = p_qty,
      "averagePrice" = p_price,
      "executedAt" = now(),
      "updatedAt" = now()
  WHERE id = p_order_id;
END;
$$;

-- Transactional position close RPC
CREATE OR REPLACE FUNCTION fn_close_position(
  p_position_id uuid,
  p_account_id uuid,
  p_exit_price numeric,
  p_release_margin numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_pos positions%ROWTYPE;
  v_realized numeric;
BEGIN
  SELECT * INTO v_pos FROM positions WHERE id = p_position_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found';
  END IF;

  v_realized := (p_exit_price - v_pos."averagePrice") * v_pos.quantity;

  UPDATE positions
  SET quantity = 0,
      "unrealizedPnL" = v_realized,
      "dayPnL" = v_realized,
      "updatedAt" = now()
  WHERE id = p_position_id;

  -- Release margin
  PERFORM fn_release_margin(p_account_id, p_release_margin, p_position_id::text);

  -- Credit/Debit realized PnL
  IF v_realized <> 0 THEN
    IF v_realized > 0 THEN
      PERFORM fn_credit(p_account_id, abs(v_realized), 'REALIZED PNL', p_position_id::text);
    ELSE
      PERFORM fn_debit(p_account_id, abs(v_realized), 'REALIZED PNL', p_position_id::text);
    END IF;
  END IF;
END;
$$;


