-- Ensure one appeal case per application in existing databases.
-- 1) Merge duplicate appeal cases by keeping the oldest case per application.
-- 2) Re-attach child rows to the kept case.
-- 3) Add DB-level unique constraint on appeal_cases(application_id).

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'appeal_cases'
    ) THEN
        WITH ranked_cases AS (
            SELECT
                id,
                application_id,
                FIRST_VALUE(id) OVER (
                    PARTITION BY application_id
                    ORDER BY created_at ASC NULLS FIRST, id ASC
                ) AS keep_id,
                ROW_NUMBER() OVER (
                    PARTITION BY application_id
                    ORDER BY created_at ASC NULLS FIRST, id ASC
                ) AS rn
            FROM appeal_cases
        ),
        duplicate_cases AS (
            SELECT id AS dup_id, keep_id
            FROM ranked_cases
            WHERE rn > 1
        ),
        keeper_max_appeal_no AS (
            SELECT
                d.keep_id,
                COALESCE(MAX(v.appeal_no), 0) AS max_appeal_no
            FROM duplicate_cases d
            LEFT JOIN appeal_versions v ON v.appeal_case_id = d.keep_id
            GROUP BY d.keep_id
        ),
        versions_to_move AS (
            SELECT
                v.id AS version_id,
                d.keep_id,
                km.max_appeal_no
                    + ROW_NUMBER() OVER (
                        PARTITION BY d.keep_id
                        ORDER BY v.submitted_at ASC NULLS FIRST, v.appeal_no ASC, v.id ASC
                    ) AS new_appeal_no
            FROM duplicate_cases d
            JOIN appeal_versions v ON v.appeal_case_id = d.dup_id
            JOIN keeper_max_appeal_no km ON km.keep_id = d.keep_id
        )
        UPDATE appeal_versions av
        SET
            appeal_case_id = vtm.keep_id,
            appeal_no = vtm.new_appeal_no
        FROM versions_to_move vtm
        WHERE av.id = vtm.version_id;

        WITH ranked_cases AS (
            SELECT
                id,
                application_id,
                FIRST_VALUE(id) OVER (
                    PARTITION BY application_id
                    ORDER BY created_at ASC NULLS FIRST, id ASC
                ) AS keep_id,
                ROW_NUMBER() OVER (
                    PARTITION BY application_id
                    ORDER BY created_at ASC NULLS FIRST, id ASC
                ) AS rn
            FROM appeal_cases
        ),
        duplicate_cases AS (
            SELECT id AS dup_id, keep_id
            FROM ranked_cases
            WHERE rn > 1
        )
        UPDATE appeal_member_notes n
        SET appeal_case_id = d.keep_id
        FROM duplicate_cases d
        WHERE n.appeal_case_id = d.dup_id;

        WITH ranked_cases AS (
            SELECT
                id,
                application_id,
                ROW_NUMBER() OVER (
                    PARTITION BY application_id
                    ORDER BY created_at ASC NULLS FIRST, id ASC
                ) AS rn
            FROM appeal_cases
        )
        DELETE FROM appeal_cases ac
        USING ranked_cases rc
        WHERE ac.id = rc.id
          AND rc.rn > 1;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public'
              AND t.relname = 'appeal_cases'
              AND c.conname = 'uq_appeal_cases_application_id'
        ) THEN
            ALTER TABLE appeal_cases
                ADD CONSTRAINT uq_appeal_cases_application_id UNIQUE (application_id);
        END IF;
    END IF;
END $$;
