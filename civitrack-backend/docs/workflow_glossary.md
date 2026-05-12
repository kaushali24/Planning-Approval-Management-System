# Workflow Glossary (Canonical Terms)

This glossary defines how status names must be interpreted across legacy and simple APIs.
Use these terms in code, logs, notifications, and UI labels.

## Core Principle

- `applications.status` is the canonical current state.
- `application_status_history` is immutable audit history.
- Every workflow transition must update both.

## Stage Terms

- `submitted`: applicant submitted (or resubmitted) application package.
- `verified`: Planning Officer (PO) completed preliminary verification with no deficiencies.
- `correction`: applicant action required (deficiency loop).
- `payment_pending`: fee was set; payment confirmation is pending.
- `under_review`: Technical Officer (TO) active review/investigation stage.
- `hold_complaint`: TO paused workflow due to complaint handling.
- `hold_clearance`: TO paused workflow pending external clearance.
- `sw_review_pending`: TO completed report; Superintendent of Works (SW) review pending.
- `endorsed`: SW endorsed for committee decision.
- `not_granted_appeal_required`: committee did not grant; applicant may appeal.
- `appeal_submitted`: appeal workflow entered.
- `approved`: committee approved.
- `permit_approved`: permit is approved for issuance.
- `permit_collected`: permit physically collected.
- `coc_pending`: COC request in progress.
- `coc_issued`: COC issued.
- `closed`: terminal workflow state.

## Role-Oriented Language

- **PO review status**: statuses PO directly manages (typically `submitted`, `verified`, `payment_pending`, `correction`).
- **TO review status**: statuses TO directly manages (typically `under_review`, `hold_*`, and report submission to `sw_review_pending`).
- **SW review status**: `sw_review_pending` and SW referral/endorsement outcomes.
- **Committee decision status**: `endorsed` -> `approved` / `rejected` / `not_granted_appeal_required`.

## Hold Interpretation

- If status is `hold_complaint` or `hold_clearance`, workflow is paused.
- Non-admin transitions must be blocked until hold resolution.
- Hold details (reason, authority, notes) must come from `application_holds` rows.
