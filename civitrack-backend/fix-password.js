const bcrypt = require('bcryptjs');
const pool = require('./config/db');

async function fixPassword() {
  try {
    const password = 'Admin@123';
    const newHash = await bcrypt.hash(password, 10);
    
    console.log('Generated new hash:', newHash);
    
    // Update password for test applicant
    const result = await pool.query(
      'UPDATE applicants SET password_hash = $1 WHERE email = $2 RETURNING email, password_hash',
      [newHash, 'kaushalinanayakkara2001@gmail.com']
    );
    
    console.log('✓ Password updated for:', result.rows[0]);
    
    // Verify the hash works
    const testMatch = await bcrypt.compare(password, newHash);
    console.log('✓ Hash verification:', testMatch ? 'PASS' : 'FAIL');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixPassword();
