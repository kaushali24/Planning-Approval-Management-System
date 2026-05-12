-- Disable DB-level status history auto-insert trigger to avoid duplicate
-- rows when applicationStatusUpdater already writes status history explicitly.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_sync_application_status_history'
  ) THEN
    DROP TRIGGER trg_sync_application_status_history ON applications;
  END IF;
END $$;

DROP FUNCTION IF EXISTS sync_application_status_history();
