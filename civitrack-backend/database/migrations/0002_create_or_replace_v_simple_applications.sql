DROP VIEW IF EXISTS v_simple_applications;

CREATE VIEW v_simple_applications AS
SELECT
  a.id,
  a.application_code,
  a.applicant_id,
  a.application_type,
  a.status,
  a.submission_date,
  a.last_updated,
  a.submitted_applicant_name,
  a.submitted_email,
  a.submitted_address,
  a.assessment_number,
  a.deed_number,
  a.survey_plan_ref,
  a.land_extent,
  aa.assigned_to AS assigned_to_staff_id,
  assignee.full_name AS assigned_to_staff_name
FROM applications a
LEFT JOIN LATERAL (
  SELECT
    x.assigned_to
  FROM application_assignments x
  WHERE x.application_id = a.id
    AND x.status IN ('pending', 'accepted', 'in_progress')
  ORDER BY x.assigned_at DESC, x.id DESC
  LIMIT 1
) aa ON TRUE
LEFT JOIN staff_accounts assignee ON assignee.id = aa.assigned_to;
