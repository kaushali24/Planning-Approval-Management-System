-- Constraint behavior validation (safe: runs inside transaction and rolls back)
-- Run with:
-- psql "$DATABASE_URL" -P pager=off -v ON_ERROR_STOP=1 -f database/check_constraints_behavior.sql

BEGIN;

DO $$
DECLARE
    v_applicant_id INT;
    v_applicant_name TEXT;
    v_applicant_nic TEXT;
    v_applicant_email TEXT;
    v_applicant_contact TEXT;
    v_staff_id INT;
    v_application_id INT;
    v_inspection_id INT;
    v_fine_id INT;
    v_permit_id INT;
    v_coc_id INT;
    v_appeal_case_id INT;
    v_failures INT := 0;
BEGIN
    SELECT id, full_name, nic_number, email, contact_number
    INTO v_applicant_id, v_applicant_name, v_applicant_nic, v_applicant_email, v_applicant_contact
    FROM applicants
    ORDER BY id
    LIMIT 1;
    IF v_applicant_id IS NULL THEN
        RAISE EXCEPTION 'No applicant found. Create at least one applicant first.';
    END IF;

    SELECT id INTO v_staff_id FROM staff_accounts ORDER BY id LIMIT 1;
    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'No staff account found. Create at least one staff account first.';
    END IF;

    -- Seed valid parent rows used by invalid-case tests
    INSERT INTO applications (
        applicant_id,
        application_type,
        status,
        submitted_applicant_name,
        submitted_nic_number,
        submitted_address,
        submitted_contact,
        submitted_email
    )
    VALUES (
        v_applicant_id,
        'building',
        'draft',
        COALESCE(v_applicant_name, 'Constraint Test Applicant'),
        COALESCE(v_applicant_nic, '000000000000'),
        'Constraint Test Address',
        COALESCE(v_applicant_contact, '0700000000'),
        COALESCE(v_applicant_email, 'constraint-test@example.com')
    )
    RETURNING id INTO v_application_id;

    INSERT INTO inspections (application_id, staff_id, scheduled_date)
    VALUES (v_application_id, v_staff_id, NOW() + INTERVAL '1 day')
    RETURNING id INTO v_inspection_id;

    INSERT INTO fines (inspection_id, staff_id, amount, reason)
    VALUES (v_inspection_id, v_staff_id, 100.00, 'Constraint test fine')
    RETURNING id INTO v_fine_id;

    INSERT INTO permit_workflow (
        application_id,
        permit_reference,
        permit_type,
        issued_at,
        valid_until,
        max_years,
        extensions_used
    )
    VALUES (
        v_application_id,
        CONCAT('PRM-TEST-', v_application_id),
        'building',
        NOW(),
        NOW() + INTERVAL '1 year',
        5,
        0
    )
    RETURNING id INTO v_permit_id;

    INSERT INTO coc_requests (
        coc_id,
        application_id,
        applicant_id,
        applicant_email,
        applicant_name,
        status
    ) VALUES (
        CONCAT('COC-TEST-', v_application_id),
        v_application_id,
        v_applicant_id,
        COALESCE(v_applicant_email, 'constraint-test@example.com'),
        COALESCE(v_applicant_name, 'Constraint Test Applicant'),
        'requested'
    )
    RETURNING id INTO v_coc_id;

    INSERT INTO appeal_cases (
        application_id,
        route,
        status
    ) VALUES (
        v_application_id,
        'committee',
        'submitted'
    )
    RETURNING id INTO v_appeal_case_id;

    -- 1) applications.status CHECK
    BEGIN
        UPDATE applications
        SET status = 'invalid_status'
        WHERE id = v_application_id;

        v_failures := v_failures + 1;
        RAISE NOTICE 'FAIL: applications.status CHECK did not block invalid value';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: applications.status CHECK blocks invalid value';
    END;

    -- 2) inspections.result CHECK
    BEGIN
        INSERT INTO inspections (application_id, staff_id, scheduled_date, result)
        VALUES (v_application_id, v_staff_id, NOW() + INTERVAL '2 day', 'InvalidResult');

        v_failures := v_failures + 1;
        RAISE NOTICE 'FAIL: inspections.result CHECK did not block invalid value';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: inspections.result CHECK blocks invalid value';
    END;

    -- 3) payments exclusive FK CHECK (application_id + fine_id both set)
    BEGIN
        INSERT INTO payments (application_id, fine_id, payment_type, amount, status)
        VALUES (v_application_id, v_fine_id, 'application_fee', 2500.00, 'pending');

        v_failures := v_failures + 1;
        RAISE NOTICE 'FAIL: payments exclusive FK CHECK did not block multi-reference row';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: payments exclusive FK CHECK blocks multi-reference row';
    END;

    -- 4) notifications exclusive recipient CHECK (both applicant and staff set)
    BEGIN
        INSERT INTO notifications (
            user_type, applicant_id, staff_id, notification_type, title, message, priority
        ) VALUES (
            'staff', v_applicant_id, v_staff_id, 'application_status', 'Test', 'Should fail', 'normal'
        );

        v_failures := v_failures + 1;
        RAISE NOTICE 'FAIL: notifications recipient CHECK did not block dual recipient';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: notifications recipient CHECK blocks dual recipient';
    END;

    -- 5) application_assignments cannot self-assign CHECK
    BEGIN
        INSERT INTO application_assignments (
            application_id, assigned_to, assigned_by, assignment_type, status, priority
        ) VALUES (
            v_application_id, v_staff_id, v_staff_id, 'initial_review', 'pending', 'normal'
        );

        v_failures := v_failures + 1;
        RAISE NOTICE 'FAIL: application_assignments self-assignment CHECK did not block invalid row';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: application_assignments self-assignment CHECK blocks invalid row';
    END;

    -- 6) FK behavior: documents.application_id references applications(id)
    BEGIN
        INSERT INTO documents (application_id, doc_type, file_url)
        VALUES (99999999, 'deed', 'https://example.com/test.pdf');

        v_failures := v_failures + 1;
        RAISE NOTICE 'FAIL: documents.application_id FK did not block invalid parent';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'PASS: documents.application_id FK blocks invalid parent';
    END;

    -- 7) coc_requests.status CHECK
    BEGIN
        UPDATE coc_requests
        SET status = 'totally-invalid-status'
        WHERE id = v_coc_id;

        v_failures := v_failures + 1;
        RAISE NOTICE 'FAIL: coc_requests.status CHECK did not block invalid value';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: coc_requests.status CHECK blocks invalid value';
    END;

    -- 8) permit_extensions extension window CHECK (extended must be later than previous)
    BEGIN
        INSERT INTO permit_extensions (
            permit_id,
            extension_no,
            fee_amount,
            payment_status,
            previous_valid_until,
            extended_valid_until,
            approved_by
        ) VALUES (
            v_permit_id,
            1,
            5000,
            'completed',
            NOW() + INTERVAL '1 year',
            NOW() + INTERVAL '11 months',
            v_staff_id
        );

        v_failures := v_failures + 1;
        RAISE NOTICE 'FAIL: permit_extensions window CHECK did not block invalid dates';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: permit_extensions window CHECK blocks invalid dates';
    END;

    -- 9) appeal_cases route CHECK
    BEGIN
        UPDATE appeal_cases
        SET route = 'unknown-route'
        WHERE id = v_appeal_case_id;

        v_failures := v_failures + 1;
        RAISE NOTICE 'FAIL: appeal_cases.route CHECK did not block invalid route';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: appeal_cases.route CHECK blocks invalid route';
    END;

    -- 10) permit_collection_checks check_type CHECK
    BEGIN
        INSERT INTO permit_collection_checks (
            permit_id,
            check_type,
            is_completed
        ) VALUES (
            v_permit_id,
            'invalid-check-type',
            TRUE
        );

        v_failures := v_failures + 1;
        RAISE NOTICE 'FAIL: permit_collection_checks.check_type CHECK did not block invalid value';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: permit_collection_checks.check_type CHECK blocks invalid value';
    END;

    IF v_failures > 0 THEN
        RAISE EXCEPTION 'Constraint behavior check failed (% cases).', v_failures;
    END IF;

    RAISE NOTICE 'All constraint behavior checks passed.';
END $$;

ROLLBACK;
