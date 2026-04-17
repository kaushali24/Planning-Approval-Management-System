#!/usr/bin/env node
/**
 * Simple registration smoke test for auth endpoints.
 *
 * Environment variables:
 *   API_HOST=localhost
 *   API_PORT=5000
 *   API_PREFIX=/api
 *   REQUEST_TIMEOUT_MS=15000
 */

const http = require('http');

const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = Number(process.env.API_PORT || 5000);
const API_PREFIX = process.env.API_PREFIX || '/api';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const MAX_HEALTH_RETRIES = 5;

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: `${API_PREFIX}${path}`,
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: REQUEST_TIMEOUT_MS
    };

    console.log(`\n[REQUEST] ${method} http://${options.hostname}:${options.port}${options.path}`);
    if (data) {
      console.log('[REQUEST_BODY]', JSON.stringify(data));
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        console.log(`[RESPONSE] status=${res.statusCode}`);
        console.log('[RESPONSE_BODY]', body);
        try {
          resolve({
            status: res.statusCode,
            body: body ? JSON.parse(body) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body
          });
        }
      });
    });

    req.on('error', (err) => {
      const errorCode = err && err.code ? err.code : 'UNKNOWN';
      const errorMessage = err && err.message ? err.message : 'No error message available';
      const detailedError = new Error(
        `${errorCode}: ${errorMessage} (${options.hostname}:${options.port}${options.path})`
      );
      console.error('[ERROR]', detailedError.message);
      reject(detailedError);
    });

    req.on('timeout', () => {
      console.error('[TIMEOUT] Request timed out');
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

function assertCondition(condition, message, context = null) {
  if (condition) {
    return;
  }

  if (context) {
    throw new Error(`${message} | context=${JSON.stringify(context)}`);
  }

  throw new Error(message);
}

function assertErrorResponse(response, expectedStatus, expectedMessagePart, scenarioName) {
  assertCondition(
    response.status === expectedStatus,
    `${scenarioName}: expected status ${expectedStatus}`,
    response
  );
  assertCondition(
    typeof response.body === 'object' && response.body !== null,
    `${scenarioName}: expected JSON error response`,
    response
  );
  assertCondition(
    typeof response.body.error === 'string',
    `${scenarioName}: expected error message string`,
    response.body
  );
  assertCondition(
    response.body.error.includes(expectedMessagePart),
    `${scenarioName}: unexpected error message`,
    response.body
  );
}

async function waitForHealthCheck() {
  for (let attempt = 1; attempt <= MAX_HEALTH_RETRIES; attempt += 1) {
    try {
      const health = await request('GET', '/health');
      if (health.status === 200) {
        return health;
      }
    } catch (error) {
      if (attempt === MAX_HEALTH_RETRIES) {
        throw error;
      }
    }
  }

  throw new Error('Health check did not return 200 within retry limit');
}

async function runTests() {
  try {
    console.log('\n===================================');
    console.log('Health Check');
    console.log('===================================');

    const health = await waitForHealthCheck();
    assertCondition(health.status === 200, 'Health check failed', health);
    assertCondition(
      typeof health.body === 'object' && health.body !== null,
      'Health response is not JSON',
      health
    );
    assertCondition(
      typeof health.body.status === 'string',
      'Health response missing status string',
      health.body
    );
    console.log('[PASS] Health check passed');

    console.log('\n===================================');
    console.log('Registration Tests');
    console.log('===================================');

    const seed = Date.now();
    const uniqueFromSeed = (value, mod, min) => String((value % mod) + min);
    const makeNic = (offset = 0) => `${uniqueFromSeed(seed + offset, 900000000, 100000000)}V`;
    const makePhone = (offset = 0) => `07${String((seed + offset) % 100000000).padStart(8, '0')}`;
    const makeEmail = (offset = 0) => `test-${seed}-${offset}@example.com`;

    const registerData = {
      fullName: 'Test User',
      nicNumber: makeNic(0),
      email: makeEmail(0),
      contactNumber: makePhone(0),
      password: 'TestPassword123!'
    };

    const registerRes = await request('POST', '/auth/register', registerData);
    assertCondition(registerRes.status === 201, 'Expected 201 from /auth/register', registerRes);
    assertCondition(
      typeof registerRes.body === 'object' && registerRes.body !== null,
      'Register response is not JSON object',
      registerRes
    );
    assertCondition(
      registerRes.body.requiresVerification === true,
      'Register response requiresVerification should be true',
      registerRes.body
    );
    assertCondition(
      typeof registerRes.body.message === 'string' && registerRes.body.message.length > 0,
      'Register response missing success message',
      registerRes.body
    );
    assertCondition(
      typeof registerRes.body.user === 'object' && registerRes.body.user !== null,
      'Register response missing user object',
      registerRes.body
    );
    assertCondition(
      registerRes.body.user.email === registerData.email,
      'Returned user email does not match submitted email',
      { expected: registerData.email, actual: registerRes.body.user.email }
    );
    console.log('[PASS] Successful registration scenario');

    const duplicateEmailData = {
      ...registerData,
      nicNumber: makeNic(1),
      contactNumber: makePhone(1)
    };
    const duplicateEmailRes = await request('POST', '/auth/register', duplicateEmailData);
    assertErrorResponse(
      duplicateEmailRes,
      400,
      'Email already registered',
      'Duplicate email scenario'
    );
    console.log('[PASS] Duplicate email scenario');

    const duplicateNicData = {
      ...registerData,
      email: makeEmail(2),
      contactNumber: makePhone(2)
    };
    const duplicateNicRes = await request('POST', '/auth/register', duplicateNicData);
    assertErrorResponse(
      duplicateNicRes,
      400,
      'NIC number already registered',
      'Duplicate NIC scenario'
    );
    console.log('[PASS] Duplicate NIC scenario');

    const duplicatePhoneData = {
      ...registerData,
      nicNumber: makeNic(3),
      email: makeEmail(3)
    };
    const duplicatePhoneRes = await request('POST', '/auth/register', duplicatePhoneData);
    assertErrorResponse(
      duplicatePhoneRes,
      400,
      'Contact number already registered',
      'Duplicate phone scenario'
    );
    console.log('[PASS] Duplicate phone scenario');

    console.log('\n[PASS] All registration scenarios passed');
    process.exit(0);
  } catch (error) {
    console.error('\n[FAIL] Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
