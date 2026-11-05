/**
 * Manual Seyal attendance push test.
 *
 * Usage:
 *   node scripts/testSeyalAttendance.js email@urbancode.in leave
 *   node scripts/testSeyalAttendance.js email@urbancode.in present
 *   node scripts/testSeyalAttendance.js email@urbancode.in absent
 *
 * Requires SEYAL_INOUT_KEY and SEYAL_INOUT_ENABLED=true in .env
 */
require('dotenv').config({ override: true });

const {
  pushAttendanceToSeyal,
  toDateKey,
  isEnabled,
} = require('../services/seyalAttendanceService');

async function main() {
  const email = process.argv[2];
  const status = process.argv[3] || 'leave';
  const date = process.argv[4] || toDateKey(new Date());

  if (!email) {
    console.error('Usage: node scripts/testSeyalAttendance.js <email> [status] [YYYY-MM-DD]');
    process.exit(1);
  }

  if (!isEnabled()) {
    console.error('Set SEYAL_INOUT_ENABLED=true (and SEYAL_INOUT_KEY) in .env first.');
    process.exit(1);
  }

  const result = await pushAttendanceToSeyal({
    email,
    date,
    status,
    reason: 'InOut integration test',
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
