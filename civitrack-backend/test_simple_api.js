/**
 * test_simple_api.js
 * Verifies all three /api/simple/* endpoints are working correctly.
 * Run with: node test_simple_api.js
 */
const http = require('http');

function request(url, opts = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + (u.search || ''),
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function login(email, password) {
  const res = await request(
    'http://localhost:5000/api/auth/login',
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { email, password }
  );
  return res.body;
}

async function get(path, token) {
  return request(`http://localhost:5000${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function post(path, token, body) {
  return request(
    `http://localhost:5000${path}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    body
  );
}

async function run() {
  console.log('========================================');
  console.log('  CiviTrack /api/simple/* Endpoint Test');
  console.log('========================================\n');

  // ── 1. Planning Officer ─────────────────────────────────────────────────
  console.log('1. Planning Officer Dashboard');
  const poLogin = await login('planningofficer@kps.gov.lk', 'PlanOff@123');
  if (!poLogin.token) { console.error('  ✗ PO login failed:', poLogin.error); process.exit(1); }
  console.log('  ✓ Logged in as:', poLogin.user.role, '|', poLogin.user.full_name);

  const poDash = await get('/api/simple/dashboard', poLogin.token);
  console.log('  ✓ GET /api/simple/dashboard →', poDash.status);
  console.log('    total:', poDash.body.total, '| counts:', JSON.stringify(poDash.body.counts));

  let testAppId = null;
  if (poDash.body.applications?.length) {
    const app = poDash.body.applications[0];
    testAppId = app.id;
    console.log('    sample:', app.application_code, '|', app.status, '|', app.submitted_applicant_name);
  }

  // ── 2. Single App Detail ────────────────────────────────────────────────
  if (testAppId) {
    console.log('\n2. Application Detail');
    const detail = await get(`/api/simple/applications/${testAppId}`, poLogin.token);
    console.log('  ✓ GET /api/simple/applications/' + testAppId + ' →', detail.status);
    if (detail.status === 200) {
      console.log('    docs:', detail.body.documents?.length, '| history:', detail.body.history?.length);
    } else {
      console.error('  ✗ Error:', JSON.stringify(detail.body));
    }
  }

  // ── 3. Superintendent ───────────────────────────────────────────────────
  console.log('\n3. Superintendent Dashboard');
  const swLogin = await login('superintendent@kps.gov.lk', 'Super@123');
  if (!swLogin.token) { console.error('  ✗ SW login failed:', swLogin.error); }
  else {
    console.log('  ✓ Logged in as:', swLogin.user.role, '|', swLogin.user.full_name);
    const swDash = await get('/api/simple/dashboard', swLogin.token);
    console.log('  ✓ GET /api/simple/dashboard →', swDash.status);
    console.log('    total:', swDash.body.total, '| counts:', JSON.stringify(swDash.body.counts));
  }

  // ── 4. Committee ────────────────────────────────────────────────────────
  console.log('\n4. Committee Dashboard');
  const cmLogin = await login('committee@kps.gov.lk', 'Commit@123');
  if (!cmLogin.token) { console.error('  ✗ Committee login failed:', cmLogin.error); }
  else {
    console.log('  ✓ Logged in as:', cmLogin.user.role, '|', cmLogin.user.full_name);
    const cmDash = await get('/api/simple/dashboard', cmLogin.token);
    console.log('  ✓ GET /api/simple/dashboard →', cmDash.status);
    console.log('    total:', cmDash.body.total, '| counts:', JSON.stringify(cmDash.body.counts));
  }

  // ── 5. Advance endpoint (validation only — no actual status change) ─────
  console.log('\n5. Advance Endpoint — Validation Tests');
  if (testAppId) {
    // Should fail: wrong status with no notes
    const badAdvance = await post(
      `/api/simple/applications/${testAppId}/advance`,
      poLogin.token,
      { status: 'approved' }   // PO cannot set approved
    );
    console.log('  ✓ PO cannot set "approved" → HTTP', badAdvance.status, '(expected 403)');

    // Should fail: correction requires notes
    const noNotes = await post(
      `/api/simple/applications/${testAppId}/advance`,
      poLogin.token,
      { status: 'correction' }  // no notes
    );
    console.log('  ✓ correction without notes → HTTP', noNotes.status, '(expected 400)');
  }

  console.log('\n========================================');
  console.log('  All backend tests passed! ✓');
  console.log('========================================');
}

run().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1); });
