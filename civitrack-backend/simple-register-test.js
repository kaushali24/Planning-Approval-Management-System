#!/usr/bin/env node
/**
 * Simple registration test to debug auth endpoints
 */

const http = require('http');

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };

    console.log(`\n📡 ${method} http://${options.hostname}:${options.port}${options.path}`);
    console.log('📨 Body:', data);

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`📥 Status: ${res.statusCode}`);
        console.log('📬 Response:', body);
        try {
          resolve({
            status: res.statusCode,
            body: body ? JSON.parse(body) : body
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: body
          });
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Error:', err.message);
      reject(err);
    });

    req.on('timeout', () => {
      console.error('⏱️ Request timeout');
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  try {
    console.log('\n═══════════════════════════════════');
    console.log('  Health Check');
    console.log('═══════════════════════════════════');
    
    const health = await request('GET', '/health');
    console.log('Health check passed!');

    console.log('\n═══════════════════════════════════');
    console.log('  Simple Registration Test');
    console.log('═══════════════════════════════════');

    const registerData = {
      fullName: 'Test User',
      nicNumber: '123456789V',
      email: `test-${Date.now()}@example.com`,
      contactNumber: '0712345678',
      password: 'TestPassword123!'
    };

    const registerRes = await request('POST', '/auth/register', registerData);
    console.log('\n✅ Registration test complete!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run with a small delay to ensure server is ready
setTimeout(runTests, 500);
