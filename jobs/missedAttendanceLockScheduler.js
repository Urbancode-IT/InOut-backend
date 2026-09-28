const cron = require('node-cron');
const { TIMEZONE, getLockHour } = require('../utils/missedAttendanceLock');
const { runMissedAttendanceLock } = require('../services/missedAttendanceLockService');

let started = false;

const startMissedAttendanceLockScheduler = () => {
  if (process.env.MISSED_ATTENDANCE_LOCK_ENABLED === 'false') {
    console.log('[InoutLock] Scheduler disabled (MISSED_ATTENDANCE_LOCK_ENABLED=false)');
    return { started: false };
  }

  if (started) {
    console.log('[InoutLock] Scheduler already running');
    return { started: true };
  }

  const hour = String(getLockHour()).padStart(2, '0');
  cron.schedule(
    `0 ${Number(hour)} * * *`,
    async () => {
      try {
        const report = await runMissedAttendanceLock();
        console.log(
          `[InoutLock] date=${report.dateKey || '-'} locked=${report.lockedCount || 0} candidates=${report.candidateCount || 0}`
        );
      } catch (err) {
        console.error('[InoutLock] run failed:', err.message);
      }
    },
    { timezone: TIMEZONE }
  );

  started = true;
  console.log(`[InoutLock] Scheduler started (Asia/Kolkata ${hour}:00)`);
  return { started: true };
};

module.exports = {
  startMissedAttendanceLockScheduler,
};
