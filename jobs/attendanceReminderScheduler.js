const cron = require('node-cron');
const {
  TIMEZONE,
  runCheckInReminder,
  runCheckout6pmReminder,
  runCheckout8pmReminder,
} = require('../services/attendanceReminderService');

let started = false;

const summarize = (label, report) => {
  if (report?.skipped) {
    const detail =
      report.skippedReason === 'holiday' && report.holidayName
        ? `holiday (${report.holidayName})`
        : report.skippedReason;
    console.log(
      `[AttendanceReminder] ${label} skipped date=${report.dateKey} reason=${detail}`
    );
    return;
  }
  const sent = (report.results || []).filter((r) => r.status === 'sent').length;
  const skipped = (report.results || []).filter((r) => r.status === 'skipped_duplicate').length;
  const failed = (report.results || []).filter((r) => r.status === 'failed').length;
  console.log(
    `[AttendanceReminder] ${label} date=${report.dateKey} candidates=${report.candidateCount} sent=${sent} skipped=${skipped} failed=${failed}`
  );
  if (failed > 0) {
    const sample = (report.results || [])
      .filter((r) => r.status === 'failed')
      .slice(0, 3)
      .map((r) => `${r.email}: ${r.error || 'unknown'}`);
    console.error(`[AttendanceReminder] ${label} errors: ${sample.join(' | ')}`);
  }
};

const safeRun = async (label, fn) => {
  try {
    const report = await fn();
    summarize(label, report);
    return report;
  } catch (err) {
    console.error(`[AttendanceReminder] ${label} failed:`, err.message);
    return null;
  }
};

/**
 * Starts IST cron jobs for attendance + meeting-call reminder emails.
 * Idempotent: calling twice does not register duplicate schedules.
 */
const startAttendanceReminderScheduler = () => {
  if (process.env.ATTENDANCE_REMINDERS_ENABLED === 'false') {
    console.log('[AttendanceReminder] Scheduler disabled (ATTENDANCE_REMINDERS_ENABLED=false)');
    return { started: false };
  }

  if (started) {
    console.log('[AttendanceReminder] Scheduler already running');
    return { started: true };
  }

  // Mon–Sat only (1-6): no reminders on Sunday.
  // Company holidays are also skipped inside attendanceReminderService.

  // 10:00 AM IST — Check-In reminder
  cron.schedule(
    '0 10 * * 1-6',
    () => {
      safeRun('checkin-10am', () => runCheckInReminder());
    },
    { timezone: TIMEZONE }
  );


  // 6:00 PM IST — Check-Out reminder
  cron.schedule(
    '0 18 * * 1-6',
    () => {
      safeRun('checkout-6pm', () => runCheckout6pmReminder());
    },
    { timezone: TIMEZONE }
  );

  // 8:00 PM IST — Final Check-Out reminder
  cron.schedule(
    '0 20 * * 1-6',
    () => {
      safeRun('checkout-8pm', () => runCheckout8pmReminder());
    },
    { timezone: TIMEZONE }
  );

  started = true;
  console.log(
    '[AttendanceReminder] Scheduler started (Asia/Kolkata Mon-Sat: 10:00, 18:00, 20:00; skipped on Sundays & holidays)'
  );
  return { started: true };
};

module.exports = {
  startAttendanceReminderScheduler,
  safeRun,
};
