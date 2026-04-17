#!/usr/bin/env node
require('dotenv').config();

const app = require('./server');
const pool = require('./config/db');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const results = {
  passed: 0,
  failed: 0,
  failures: [],
};

const CREDENTIALS = {
  applicant: { email: 'pabodakaushali2001@gmail.com', password: 'Admin@123' },
  admin: { email: 'admin@kps.gov.lk', password: 'Admin@123' },
};

const nowStamp = Date.now();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTest(name, fn) {
  try {
    process.stdout.write(`  - ${name} ... `);
    await fn();
    results.passed += 1;
    console.log(`${COLORS.green}PASS${COLORS.reset}`);
  } catch (error) {
    results.failed += 1;
    results.failures.push({ name, error: error.message });
    console.log(`${COLORS.red}FAIL${COLORS.reset}`);
    console.log(`    ${COLORS.red}${error.message}${COLORS.reset}`);
  }
}

async function request(baseUrl, method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_err) {
    parsed = { raw: text };
  }

  return {
    status: response.status,
    body: parsed,
  };
}

async function login(baseUrl, creds) {
  const res = await request(baseUrl, 'POST', '/api/auth/login', { body: creds });
  if (res.status !== 200 || !res.body || !res.body.token) {
    throw new Error(`Login failed for ${creds.email}. status=${res.status} body=${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function main() {
  console.log(`${COLORS.cyan}CiviTrack Backend Workflow Smoke Tests${COLORS.reset}`);

  const server = app.listen(0);
  const baseUrl = await new Promise((resolve) => {
    server.on('listening', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

  const state = {
    applicantToken: null,
    adminToken: null,
    adminId: null,
    applicationId: null,
    appealId: null,
    cocRequestId: null,
    extensionFeeAmount: 5000,
  };

  try {
    await runTest('Health endpoint', async () => {
      const res = await request(baseUrl, 'GET', '/api/health');
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body && res.body.status, 'Health response missing status');
    });

    await runTest('Login applicant', async () => {
      const auth = await login(baseUrl, CREDENTIALS.applicant);
      state.applicantToken = auth.token;
      assert(auth.user && auth.user.role === 'applicant', 'Expected applicant role');
    });

    await runTest('Login admin', async () => {
      const auth = await login(baseUrl, CREDENTIALS.admin);
      state.adminToken = auth.token;
      state.adminId = auth.user.id;
      assert(auth.user && auth.user.role === 'admin', 'Expected admin role');
    });

    await runTest('Create application (applicant)', async () => {
      const payload = {
        application_type: 'building',
        submitted_applicant_name: 'Nimal Jayasinghe',
        submitted_nic_number: '123456789V',
        submitted_address: '123 Main Street, Kelaniya',
        submitted_contact: '0712345678',
        submitted_email: 'kaushalinanayakkara2001@gmail.com',
      };
      const res = await request(baseUrl, 'POST', '/api/applications', {
        token: state.applicantToken,
        body: payload,
      });
      assert(res.status === 201, `Expected 201, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert(res.body && res.body.application && res.body.application.id, 'Application id missing');
      state.applicationId = res.body.application.id;
    });

    await runTest('Create appeal case', async () => {
      const res = await request(baseUrl, 'POST', '/api/appeals', {
        token: state.applicantToken,
        body: {
          application_id: state.applicationId,
          route: 'committee',
          summary: `Appeal round 1 - ${nowStamp}`,
          corrections_category: 'documents',
          contains_new_plans: false,
          documents: [
            { label: 'Revised document checklist', kind: 'additional', required: true },
          ],
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert(res.body && res.body.appealCase && res.body.appealCase.id, 'Appeal case id missing');
      state.appealId = res.body.appealCase.id;
    });

    await runTest('Update appeal status (admin)', async () => {
      const res = await request(baseUrl, 'PATCH', `/api/appeals/${state.appealId}/status`, {
        token: state.adminToken,
        body: {
          status: 'forwarded-to-committee',
          route: 'committee',
          portal_open: false,
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status} body=${JSON.stringify(res.body)}`);
    });

    await runTest('Create COC request', async () => {
      const res = await request(baseUrl, 'POST', '/api/coc-requests', {
        token: state.applicantToken,
        body: {
          application_id: state.applicationId,
          notes: 'Requesting COC after permit processing',
          declarations: ['construction_complete'],
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert(res.body && res.body.cocRequest && res.body.cocRequest.id, 'COC request id missing');
      state.cocRequestId = res.body.cocRequest.id;
    });

    await runTest('Add COC declaration row', async () => {
      const res = await request(baseUrl, 'POST', `/api/coc-requests/${state.cocRequestId}/declarations`, {
        token: state.applicantToken,
        body: {
          declaration_type: 'construction_complete',
          accepted: true,
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert(res.body && res.body.declaration && res.body.declaration.id, 'COC declaration id missing');
    });

    await runTest('Issue permit (admin)', async () => {
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);

      const res = await request(baseUrl, 'POST', `/api/permits/${state.applicationId}/issue`, {
        token: state.adminToken,
        body: {
          valid_until: nextYear.toISOString(),
          permit_reference: `PRM-SMOKE-${state.applicationId}-${nowStamp}`,
          max_years: 5,
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert(res.body && res.body.permit && res.body.permit.id, 'Permit id missing');
    });

    await runTest('Extend permit (admin)', async () => {
      const res = await request(baseUrl, 'POST', `/api/permits/${state.applicationId}/extend`, {
        token: state.adminToken,
        body: {
          payment_status: 'completed',
          payment_reference: `PAY-SMOKE-${nowStamp}`,
          payment_method: 'card',
          notes: 'Smoke test extension',
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert(res.body && res.body.extension && res.body.extension.id, 'Extension id missing');
      const fee = Number.parseFloat(res.body.extension.fee_amount);
      state.extensionFeeAmount = Number.isFinite(fee) ? fee : 5000;
    });

    await runTest('Record permit extension payment row', async () => {
      const transactionId = `TXN-SMOKE-EXT-${state.applicationId}-${nowStamp}`;
      const inserted = await pool.query(
        `INSERT INTO payments (
          application_id,
          payment_type,
          amount,
          status,
          transaction_id,
          payment_method,
          paid_at,
          created_at
        )
        VALUES ($1, 'permit_extension_fee', $2, 'completed', $3, 'card', NOW(), NOW())
        RETURNING id`,
        [state.applicationId, state.extensionFeeAmount, transactionId]
      );

      assert(inserted.rows.length === 1, 'Permit extension payment row was not created');
    });

    await runTest('Collect permit (admin)', async () => {
      const res = await request(baseUrl, 'POST', `/api/permits/${state.applicationId}/collect`, {
        token: state.adminToken,
        body: {
          checks: [
            { check_type: 'applicant_identity_verified', is_completed: true },
            { check_type: 'official_permit_signed_and_sealed', is_completed: true },
          ],
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert(res.body && res.body.permit && res.body.permit.permit_collected === true, 'Permit should be marked collected');
    });

    await runTest('Get permit by application', async () => {
      const res = await request(baseUrl, 'GET', `/api/permits/${state.applicationId}`, {
        token: state.adminToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert(Array.isArray(res.body.extensions), 'Expected permit extensions array');
      assert(Array.isArray(res.body.collection_checks), 'Expected collection checks array');
    });

    await runTest('Get expiring permits report', async () => {
      const res = await request(baseUrl, 'GET', '/api/permits/reports/expiring?days=90', {
        token: state.adminToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert(Array.isArray(res.body.permits), 'Expected permits array in report');
    });

    await runTest('Get applications stats summary', async () => {
      const res = await request(baseUrl, 'GET', '/api/applications/stats/summary', {
        token: state.adminToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert(Array.isArray(res.body.stats), 'Expected stats array');
    });

    await runTest('Normalize historical smoke workflow artifacts', async () => {
      await pool.query(
        `INSERT INTO payments (
          application_id,
          payment_type,
          amount,
          status,
          transaction_id,
          payment_method,
          paid_at,
          created_at
        )
        SELECT
          pw.application_id,
          'permit_extension_fee',
          pe.fee_amount,
          'completed',
          CONCAT('TXN-SMOKE-BACKFILL-EXT-', pe.id, '-', EXTRACT(EPOCH FROM NOW())::bigint),
          COALESCE(pe.payment_method, 'card'),
          COALESCE(pe.approved_at, NOW()),
          NOW()
        FROM permit_extensions pe
        JOIN permit_workflow pw ON pw.id = pe.permit_id
        WHERE pw.permit_reference LIKE 'PRM-SMOKE-%'
          AND pe.payment_status = 'completed'
          AND NOT EXISTS (
            SELECT 1
            FROM payments p
            WHERE p.application_id = pw.application_id
              AND p.payment_type = 'permit_extension_fee'
              AND p.status = 'completed'
              AND p.amount >= pe.fee_amount
          )`
      );

      await pool.query(
        `INSERT INTO coc_declarations (coc_request_id, declaration_type, accepted, acknowledged_at)
        SELECT
          cr.id,
          'construction_complete',
          TRUE,
          NOW()
        FROM coc_requests cr
        JOIN permit_workflow pw ON pw.application_id = cr.application_id
        WHERE pw.permit_reference LIKE 'PRM-SMOKE-%'
          AND NOT EXISTS (
            SELECT 1
            FROM coc_declarations cd
            WHERE cd.coc_request_id = cr.id
          )
        ON CONFLICT (coc_request_id, declaration_type)
        DO UPDATE SET accepted = EXCLUDED.accepted, acknowledged_at = NOW()`
      );
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('');
  console.log(`${COLORS.yellow}Summary:${COLORS.reset} ${results.passed} passed, ${results.failed} failed`);

  if (results.failed > 0) {
    console.log(`${COLORS.red}Failures:${COLORS.reset}`);
    for (const failure of results.failures) {
      console.log(`  - ${failure.name}: ${failure.error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`${COLORS.green}All backend workflow smoke tests passed.${COLORS.reset}`);
}

main().catch((error) => {
  console.error(`${COLORS.red}Fatal test runner error:${COLORS.reset}`, error);
  process.exit(1);
});
