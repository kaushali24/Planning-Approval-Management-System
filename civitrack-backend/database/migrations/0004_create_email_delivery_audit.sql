CREATE TABLE IF NOT EXISTS email_delivery_audit (
  id BIGSERIAL PRIMARY KEY,
  template_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  message_id TEXT,
  error_message TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_audit_created_at
  ON email_delivery_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_audit_recipient
  ON email_delivery_audit (recipient_email);

CREATE INDEX IF NOT EXISTS idx_email_delivery_audit_status
  ON email_delivery_audit (status);
