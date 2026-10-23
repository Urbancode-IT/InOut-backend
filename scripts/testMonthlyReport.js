/**
 * Monthly report email tests / manual trigger.
 *
 * Unit only (no DB/SMTP):
 *   node scripts/testMonthlyReport.js
 *
 * Dry-run against DB (no emails):
 *   node scripts/testMonthlyReport.js --dry-run
 *
 * Send for real (previous month):
 *   node scripts/testMonthlyReport.js --send
 *
 * Force re-send (even if already logged):
 *   node scripts/testMonthlyReport.js --send --force
 *
 * One user only:
 *   node scripts/testMonthlyReport.js --send --user=<mongoUserId>
 */
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const {
  getPreviousMonthMeta,
  buildEmployeeAttendance,
  buildAutoPayslipPayload,
  calculateLopDays,
  calculatePaidGrossPay,
  annualToMonthlySalary,
  runMonthlyReports,
} = require('../services/monthlyReportService');
const { buildMonthlyReportHtml } = require('../utils/monthlyReportEmails');

const args = process.argv.slice(2);
const wantDryRun = args.includes('--dry-run');
const wantSend = args.includes('--send');
const wantForce = args.includes('--force');
const userArg = args.find((a) => a.startsWith('--user='));
const userId = userArg ? userArg.split('=')[1] : null;

const results = [];
const pass = (name) => {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
};
const fail = (name, err) => {
  results.push({ name, ok: false, err: String(err && err.message ? err.message : err) });
  console.error(`FAIL  ${name}:`, err && err.message ? err.message : err);
};

function runUnit() {
  try {
    // Simulate "2026-08-08 IST" → previous month July 2026
    const meta = getPreviousMonthMeta(new Date('2026-08-08T04:30:00.000Z'));
    assert.strictEqual(meta.monthKey, '2026-07');
    assert.strictEqual(meta.monthLabel, 'July 2026');
    assert.strictEqual(meta.daysInMonth, 31);
    assert.strictEqual(meta.year, 2026);
    assert.strictEqual(meta.month, 7);
    pass('unit: previous month meta (IST)');
  } catch (e) {
    fail('unit: previous month meta (IST)', e);
  }

  try {
    const meta = getPreviousMonthMeta(new Date('2026-01-05T04:30:00.000Z'));
    assert.strictEqual(meta.monthKey, '2025-12');
    assert.strictEqual(meta.monthLabel, 'December 2025');
    assert.strictEqual(meta.daysInMonth, 31);
    pass('unit: previous month wraps year');
  } catch (e) {
    fail('unit: previous month wraps year', e);
  }

  try {
    const meta = getPreviousMonthMeta(new Date('2026-08-08T04:30:00.000Z'));
    const attendance = buildEmployeeAttendance({
      logs: [
        {
          type: 'check-in',
          timestamp: new Date('2026-07-01T03:40:00.000Z'), // 09:10 IST
        },
        {
          type: 'check-out',
          timestamp: new Date('2026-07-01T12:30:00.000Z'),
        },
      ],
      weeklySchedule: {
        Wednesday: { start: '09:00', end: '18:00', isLeave: false },
        Monday: { start: '09:00', end: '18:00', isLeave: false },
        Tuesday: { start: '09:00', end: '18:00', isLeave: false },
        Thursday: { start: '09:00', end: '18:00', isLeave: false },
        Friday: { start: '09:00', end: '18:00', isLeave: false },
        Saturday: { isLeave: true },
        Sunday: { isLeave: true },
      },
      holidayKeys: new Set(),
      approvedLeaves: [],
      monthMeta: meta,
    });
    assert.ok(attendance.summary.workingDays > 0);
    assert.ok(attendance.summary.presentDays >= 1);
    assert.ok(Array.isArray(attendance.days) && attendance.days.length === 31);
    const july1 = attendance.days.find((d) => d.dateKey === '2026-07-01');
    assert.ok(july1);
    assert.ok(['Present', 'Late', 'Half Day'].includes(july1.status));
    pass('unit: attendance builder counts July days');
  } catch (e) {
    fail('unit: attendance builder counts July days', e);
  }

  try {
    const html = buildMonthlyReportHtml({
      name: 'Test User',
      monthLabel: 'July 2026',
      attendance: {
        summary: {
          totalDays: 31,
          workingDays: 22,
          presentDays: 20,
          absentDays: 2,
          leaveDays: 1,
          lateDays: 3,
          halfDays: 0,
          offDays: 8,
        },
        days: [
          {
            dateLabel: '01 Jul 2026',
            dayName: 'Wednesday',
            status: 'Present',
            checkIn: '09:05 am',
            checkOut: '06:10 pm',
          },
        ],
      },
      payslip: {
        employeeDetails: {
          name: 'Test User',
          designation: 'Engineer',
          department: 'Dev',
        },
        incomes: { 'Basic Pay': 40000, HRA: 10000 },
        deductions: { PF: 2000 },
        totalIncome: 50000,
        totalDeductions: 2000,
        netPay: 48000,
      },
    });
    assert.ok(html.includes('Monthly Attendance Report — July 2026'));
    assert.ok(html.includes('Dear Test User'));
    assert.ok(html.includes('Attendance Summary'));
    assert.ok(!html.includes('Net Pay'));
    pass('unit: monthly report HTML attendance only');
  } catch (e) {
    fail('unit: monthly report HTML attendance only', e);
  }

  try {
    assert.strictEqual(calculateLopDays(2, 0), 0);
    assert.strictEqual(calculateLopDays(4, 0), 2);
    assert.strictEqual(calculateLopDays(0, 3), 1);
    assert.strictEqual(annualToMonthlySalary(120000), 10000);
    assert.strictEqual(calculatePaidGrossPay(31000, 31, 1), 30000);
    pass('unit: LOP + paid salary helpers');
  } catch (e) {
    fail('unit: LOP + paid salary helpers', e);
  }

  try {
    const meta = getPreviousMonthMeta(new Date('2026-08-08T04:30:00.000Z'));
    const payload = buildAutoPayslipPayload(
      {
        _id: 'u1',
        name: 'Auto User',
        email: 'auto@test.com',
        position: 'Dev',
        department: 'Eng',
        company: 'Urbancode',
        employeeId: 'UC0099',
        salary: 600000,
        pan: 'ABCDE1234F',
        uan: '123456789012',
        esiNumber: 'ESI1',
        empGrade: 'L1',
        bankDetails: { bankingName: 'SBI', bankAccountNumber: '111', ifscCode: 'SBIN0001' },
      },
      {
        totalDays: 31,
        workingDays: 22,
        presentDays: 20,
        absentDays: 2,
        leaveDays: 1,
        lateDays: 0,
        halfDays: 0,
      },
      meta
    );
    assert.strictEqual(payload.deductions.PF, 0);
    assert.strictEqual(payload.deductions.TDS, 0);
    assert.strictEqual(payload.incomes['Basic Pay'], payload.netPay);
    assert.ok(payload.netPay > 0);
    assert.strictEqual(payload.employeeDetails.pan, 'ABCDE1234F');
    assert.strictEqual(payload.month, 'July 2026');
    assert.strictEqual(payload.viewModelSnapshot.autoGenerated, true);
    // leave 1 + absent 2 = 3 → LOP 1
    assert.strictEqual(payload.attendanceSummary.lopDays, 1);
    pass('unit: auto payslip payload (PF/TDS 0 + attendance salary)');
  } catch (e) {
    fail('unit: auto payslip payload (PF/TDS 0 + attendance salary)', e);
  }
}

async function runDb() {
  if (!process.env.MONGO_URI) {
    console.error('Missing MONGO_URI');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');

  const report = await runMonthlyReports({
    dryRun: wantDryRun || !wantSend,
    force: wantForce,
    userId,
  });

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

(async () => {
  runUnit();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUnit: ${results.length - failed}/${results.length} passed`);

  if (wantDryRun || wantSend) {
    await runDb();
  }

  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
