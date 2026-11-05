const cron = require('node-cron');
const { TIMEZONE, getLockHour } = require('../utils/missedAttendanceLock');
const { runSeyalAbsentCatchUp } = require('../services/seyalAbsentCatchUpService');
const { isEnabled } = require('../services/seyalAttendanceService');

let started = false;

/**
 * Runs after the missed-attendance lock hour so the working day is complete.
 * Default: same hour as lock (21:00 Asia/Kolkata), minute 15.
 */
const startSeyalAbsentCatchUpScheduler = () => {
  if (process.env.SEYAL_ABSENT_CATCHUP_ENABLED === 'false') {
    console.log('[SeyalAbsent] Scheduler disabled (SEYAL_ABSENT_CATCHUP_ENABLED=false)');
    return { started: false };
  }

  if (!isEnabled()) {
    console.log('[SeyalAbsent] Scheduler idle (SEYAL_INOUT_ENABLED not true)');
    return { started: false };
  }

  if (started) {
    console.log('[SeyalAbsent] Scheduler already running');
    return { started: true };
  }

  const hour = String(getLockHour()).padStart(2, '0');
  cron.schedule(
    `15 ${Number(hour)} * * *`,
    async () => {
      try {
        const report = await runSeyalAbsentCatchUp();
        console.log(
          `[SeyalAbsent] date=${report.dateKey || '-'} pushed=${report.pushedCount || 0}`
        );
      } catch (err) {
        console.error('[SeyalAbsent] run failed:', err.message);
      }
    },
    { timezone: TIMEZONE }
  );

  started = true;
  console.log(`[SeyalAbsent] Scheduler started (Asia/Kolkata ${hour}:15)`);
  return { started: true };
};

module.exports = {
  startSeyalAbsentCatchUpScheduler,
};
