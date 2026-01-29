const bcrypt = require('bcryptjs');

async function testPassword() {
  const hash = '$2a$10$tGH9HBB441E9SDrwJDlFH.tHOnXEqTfEzMw00RM4UD0N7iyUPVDO.';
  const password = 'Admin@123';
  
  try {
    const match = await bcrypt.compare(password, hash);
    console.log('Password matches:', match);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testPassword();
