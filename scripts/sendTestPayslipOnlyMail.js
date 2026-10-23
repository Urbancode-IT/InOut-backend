/**
 * Send a TEST payslip-only email (no monthly attendance report).
 *
 *   node scripts/sendTestPayslipOnlyMail.js
 *   node scripts/sendTestPayslipOnlyMail.js --to=someone@example.com
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { sendTestPayslipMail } = require('../services/payslipAutoMailService');

const toArg = process.argv.find((a) => a.startsWith('--to='));
const TO = (toArg ? toArg.split('=')[1] : 'subhibackya@gmail.com').trim().toLowerCase();

(async () => {
  if (!process.env.MONGO_URI) {
    console.error('Missing MONGO_URI');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Mongo connected');
  const result = await sendTestPayslipMail({ toEmail: TO });
  console.log('SENT OK');
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('FAILED:', err && err.message ? err.message : err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
