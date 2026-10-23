const cron = require('node-cron');
const { TIMEZONE, runAutoPayslipMails } = require('../services/payslipAutoMailService');

let started = false;

const summarize = (report) => {
  if (!report) return;
  const sent = (report.results || []).filter((r) => r.status === 'sent').length;
  const skipped = (report.results || []).filter((r) => r.status === 'skipped_duplicate').length;
  const failed = (report.results || []).filter((r) => r.status === 'failed').length;
  console.log(
    `[PayslipAutoMail] month=${report.monthKey} (${report.monthLabel}) candidates=${report.candidateCount} sent=${sent} skipped=${skipped} failed=${failed}`
  );
};

const safeRun = async () => {
  try {
    const report = await runAutoPayslipMails();
    summarize(report);
    return report;
  } catch (err) {
    console.error('[PayslipAutoMail] run failed:', err.message);
    return null;
  }
};

/**
 * 4th of every month at 10:00 AM IST — previous month payslip-only emails to active employees.
 */
const startPayslipAutoMailScheduler = () => {
  if (process.env.PAYSLIP_AUTO_MAIL_ENABLED === 'false') {
    console.log('[PayslipAutoMail] Scheduler disabled (PAYSLIP_AUTO_MAIL_ENABLED=false)');
    return { started: false };
  }

  if (started) {
    console.log('[PayslipAutoMail] Scheduler already running');
    return { started: true };
  }

  cron.schedule(
    '0 10 4 * *',
    () => {
      safeRun();
    },
    { timezone: TIMEZONE }
  );

  started = true;
  console.log('[PayslipAutoMail] Scheduler started (Asia/Kolkata: 4th of month 10:00)');
  return { started: true };
};

module.exports = {
  startPayslipAutoMailScheduler,
  safeRun,
};
