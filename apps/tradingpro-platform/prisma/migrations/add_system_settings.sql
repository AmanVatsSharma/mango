-- Migration: Add SystemSettings table
-- Created: 2025-10-07
-- Description: Creates system_settings table for platform-wide configuration

-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'GENERAL' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS system_settings_key_idx ON system_settings(key);
CREATE INDEX IF NOT EXISTS system_settings_category_idx ON system_settings(category);

-- Insert default payment settings (optional)
INSERT INTO system_settings (id, key, value, description, category, is_active)
VALUES 
    (gen_random_uuid(), 'payment_qr_code', '', 'Payment QR Code image URL for deposits', 'PAYMENT', true),
    (gen_random_uuid(), 'payment_upi_id', '', 'UPI ID for payment processing', 'PAYMENT', true)
ON CONFLICT (key) DO NOTHING;

-- Success message
SELECT 'SystemSettings table created successfully!' AS message;