const cron = require('node-cron');
const { TIMEZONE, runHolidayNotice } = require('../services/holidayNoticeService');

let started = false;

const summarize = (report) => {
  if (!report) return;
  if (report.skippedReason) {
    console.log(`[HolidayNotice] skipped reason=${report.skippedReason}`);
    return;
  }
  if (report.sent) {
    console.log(
      `[HolidayNotice] Notice sent — holiday="${report.holidayName}" date="${report.holidayDate}"`
    );
  }
};

const safeRun = async () => {
  try {
    const report = await runHolidayNotice();
    summarize(report);
    return report;
  } catch (err) {
    console.error('[HolidayNotice] run failed:', err.message);
    return null;
  }
};

/**
 * Every day at 4:00 PM IST — sends holiday notice to uc_jz team chat
 * if the next day is marked as a holiday in the admin panel.
 */
const startHolidayNoticeScheduler = () => {
  if (process.env.HOLIDAY_NOTICE_ENABLED === 'false') {
    console.log('[HolidayNotice] Scheduler disabled (HOLIDAY_NOTICE_ENABLED=false)');
    return { started: false };
  }

  if (started) {
    console.log('[HolidayNotice] Scheduler already running');
    return { started: true };
  }

  // Run at 16:00 (4:00 PM) IST every day
  cron.schedule(
    '0 16 * * *',
    () => {
      safeRun();
    },
    { timezone: TIMEZONE }
  );

  started = true;
  console.log('[HolidayNotice] Scheduler started (Asia/Kolkata: 16:00)');
  return { started: true };
};

module.exports = {
  startHolidayNoticeScheduler,
  safeRun,
};
