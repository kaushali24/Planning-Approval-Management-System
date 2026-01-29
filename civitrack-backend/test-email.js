require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('Testing Gmail configuration...');
console.log('Email User:', process.env.EMAIL_USER);
console.log('Password set:', process.env.EMAIL_PASSWORD ? 'Yes (hidden)' : 'No');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.log('\n❌ Error:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Check EMAIL_USER is your Gmail address');
    console.log('2. Check EMAIL_PASSWORD is the 16-char app password (no spaces)');
    console.log('3. Ensure 2-Step Verification is enabled on Gmail');
    console.log('4. Generate new app password if needed');
  } else {
    console.log('\n✅ Gmail configured successfully!');
    console.log('You can now send OTP emails from CiviTrack.');
  }
  process.exit(error ? 1 : 0);
});
