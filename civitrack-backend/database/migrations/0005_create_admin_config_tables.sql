CREATE TABLE IF NOT EXISTS admin_fee_config (
  id SERIAL PRIMARY KEY,
  fee_type VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INT REFERENCES staff_accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  value_boolean BOOLEAN NOT NULL,
  updated_by INT REFERENCES staff_accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO admin_fee_config (fee_type, display_name, amount, is_active, updated_at)
VALUES
  ('building_permit', 'Building Permit', 5000, TRUE, NOW()),
  ('land_subdivision', 'Land Subdivision', 7500, TRUE, NOW())
ON CONFLICT (fee_type) DO NOTHING;

INSERT INTO admin_system_settings (setting_key, value_boolean, updated_at)
VALUES
  ('email_notifications', TRUE, NOW()),
  ('auto_assignment', FALSE, NOW()),
  ('data_backup', TRUE, NOW())
ON CONFLICT (setting_key) DO NOTHING;
