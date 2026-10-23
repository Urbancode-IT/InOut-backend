const cron = require('node-cron');
const { TIMEZONE, runMonthlyReports } = require('../services/monthlyReportService');

let started = false;

const summarize = (report) => {
  if (!report) return;
  const sent = (report.results || []).filter((r) => r.status === 'sent').length;
  const skipped = (report.results || []).filter((r) => r.status === 'skipped_duplicate').length;
  const failed = (report.results || []).filter((r) => r.status === 'failed').length;
  const noPayslip = (report.results || []).filter(
    (r) => r.status === 'sent' && r.hasPayslip === false
  ).length;
  console.log(
    `[MonthlyReport] month=${report.monthKey} (${report.monthLabel}) candidates=${report.candidateCount} sent=${sent} skipped=${skipped} failed=${failed} sentWithoutPayslip=${noPayslip}`
  );
};

const safeRun = async () => {
  try {
    const report = await runMonthlyReports();
    summarize(report);
    return report;
  } catch (err) {
    console.error('[MonthlyReport] run failed:', err.message);
    return null;
  }
};

/**
 * 1st of every month at 10:00 AM IST — previous month attendance digest (no payslip).
 * Payslip-only mails run separately on the 4th via payslipAutoMailScheduler.
 */
const startMonthlyReportScheduler = () => {
  if (process.env.MONTHLY_REPORTS_ENABLED === 'false') {
    console.log('[MonthlyReport] Scheduler disabled (MONTHLY_REPORTS_ENABLED=false)');
    return { started: false };
  }

  if (started) {
    console.log('[MonthlyReport] Scheduler already running');
    return { started: true };
  }

  cron.schedule(
    '0 10 1 * *',
    () => {
      safeRun();
    },
    { timezone: TIMEZONE }
  );

  started = true;
  console.log('[MonthlyReport] Scheduler started (Asia/Kolkata: 1st of month 10:00, attendance only)');
  return { started: true };
};

module.exports = {
  startMonthlyReportScheduler,
  safeRun,
};
