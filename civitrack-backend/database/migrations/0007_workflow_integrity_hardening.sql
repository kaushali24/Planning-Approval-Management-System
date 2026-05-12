-- Wave 3: DB integrity hardening for workflow-critical paths.

-- 1) Appeal version integrity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_appeal_versions_case_no'
  ) THEN
    ALTER TABLE appeal_versions
      ADD CONSTRAINT uq_appeal_versions_case_no UNIQUE (appeal_case_id, appeal_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_appeal_versions_appeal_no_positive'
  ) THEN
    ALTER TABLE appeal_versions
      ADD CONSTRAINT chk_appeal_versions_appeal_no_positive CHECK (appeal_no >= 1);
  END IF;
END $$;

-- 2) Only one active hold per application.
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_holds_one_active
  ON application_holds (application_id)
  WHERE hold_status = 'active';

-- 3) Permit extension sequencing uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS uq_permit_extensions_permit_no
  ON permit_extensions (permit_id, extension_no);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_permit_extensions_date_order'
  ) THEN
    ALTER TABLE permit_extensions
      ADD CONSTRAINT chk_permit_extensions_date_order
      CHECK (extended_valid_until > previous_valid_until);
  END IF;
END $$;

-- 4) Payment parent reference consistency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_payments_exactly_one_parent'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT chk_payments_exactly_one_parent
      CHECK (
        ((application_id IS NOT NULL)::int + (coc_request_id IS NOT NULL)::int + (fine_id IS NOT NULL)::int) = 1
      );
  END IF;
END $$;

-- 5) Keep application status history complete, even for direct SQL updates.
CREATE OR REPLACE FUNCTION sync_application_status_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO application_status_history (application_id, status, changed_by, changed_at, reason, source_stage)
    VALUES (NEW.id, NEW.status, NULL, NOW(), 'Auto-synced by DB trigger', 'db-trigger');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_sync_application_status_history'
  ) THEN
    CREATE TRIGGER trg_sync_application_status_history
      AFTER UPDATE OF status ON applications
      FOR EACH ROW
      EXECUTE FUNCTION sync_application_status_history();
  END IF;
END $$;

-- 6) Query-path indexes.
CREATE INDEX IF NOT EXISTS idx_application_status_history_app_changed
  ON application_status_history (application_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_holds_app_status
  ON application_holds (application_id, hold_status);

CREATE INDEX IF NOT EXISTS idx_coc_requests_app_status
  ON coc_requests (application_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_application_type_status
  ON payments (application_id, payment_type, status);
