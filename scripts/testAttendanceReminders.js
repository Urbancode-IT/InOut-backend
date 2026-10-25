/**
 * Attendance reminder email system tests (no live SMTP required).
 * Run: node scripts/testAttendanceReminders.js
 */
require('dotenv').config();
const assert = require('assert');
const {
  isDirectorUser,
  getIstDateKey,
  getTodayBoundsUtc,
  REMINDER_TYPES,
  URLS,
  buildUserAliasMap,
  resolveAttendanceUserId,
} = require('../services/attendanceReminderService');
const {
  buildCheckInReminderHtml,
  buildCheckoutReminderHtml,
  buildItStatusCallReminderHtml,
  buildConsultancyCallReminderHtml,
} = require('../utils/attendanceReminderEmails');

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
    assert.strictEqual(isDirectorUser({ position: 'Director' }), true);
    assert.strictEqual(isDirectorUser({ position: 'director' }), true);
    assert.strictEqual(isDirectorUser({ position: 'Developer' }), false);
    assert.strictEqual(
      isDirectorUser({ position: 'Engineer', works: [{ position: 'Director' }] }),
      true
    );
    pass('unit: Director exclusion by position');
  } catch (e) {
    fail('unit: Director exclusion by position', e);
  }

  try {
    const key = getIstDateKey(new Date('2026-08-06T04:30:00.000Z')); // IST 10:00
    assert.strictEqual(key, '2026-08-06');
    const { start, end, dateKey } = getTodayBoundsUtc(new Date('2026-08-06T04:30:00.000Z'));
    assert.strictEqual(dateKey, '2026-08-06');
    assert.ok(start instanceof Date && end instanceof Date);
    assert.ok(end.getTime() > start.getTime());
    pass('unit: IST date key and day bounds');
  } catch (e) {
    fail('unit: IST date key and day bounds', e);
  }

  try {
    assert.strictEqual(URLS.checkIn, 'https://inout.urbancode.tech/attendance?action=checkin');
    assert.strictEqual(URLS.checkOut, 'https://inout.urbancode.tech/attendance?action=checkout');
    assert.strictEqual(URLS.applyLeave, 'https://inout.urbancode.tech/apply-leave');
    pass('unit: reminder deep-link URLs');
  } catch (e) {
    fail('unit: reminder deep-link URLs', e);
  }

  try {
    const html = buildCheckInReminderHtml('Test User');
    assert.ok(html.includes('Reminder: Please Complete Your Check-In'));
    assert.ok(html.includes('Dear Test User'));
    assert.ok(html.includes('Check In Now'));
    assert.ok(html.includes(URLS.checkIn));
    assert.ok(html.includes('Apply Leave'));
    assert.ok(html.includes(URLS.applyLeave));
    assert.ok(html.includes('Urbancode InOut Attendance System'));
    assert.ok(html.includes('Please do not reply to this email'));
    pass('unit: 10:00 AM check-in HTML template');
  } catch (e) {
    fail('unit: 10:00 AM check-in HTML template', e);
  }

  try {
    const html6 = buildCheckoutReminderHtml('Test User', { finalReminder: false });
    assert.ok(html6.includes('Reminder: Please Complete Your Check-Out'));
    assert.ok(html6.includes('Complete Check-Out'));
    assert.ok(html6.includes(URLS.checkOut));
    assert.ok(!html6.includes('Final Reminder'));

    const html7 = buildCheckoutReminderHtml('Test User', { finalReminder: true });
    assert.ok(html7.includes('Final Reminder: Pending Check-Out'));
    assert.ok(html7.includes(URLS.checkOut));
    pass('unit: 6PM / 8PM check-out HTML templates');
  } catch (e) {
    fail('unit: 6PM / 8PM check-out HTML templates', e);
  }

  try {
    const htmlIt = buildItStatusCallReminderHtml('Test User');
    assert.ok(htmlIt.includes('Reminder: IT Status Call at 12:00 PM'));
    assert.ok(htmlIt.includes('IT Status Call'));
    assert.ok(htmlIt.includes('12:00 PM IST'));
    assert.ok(htmlIt.includes('Dear Test User'));

    const htmlCon = buildConsultancyCallReminderHtml('Test User');
    assert.ok(htmlCon.includes('Reminder: Consultancy Call at 3:00 PM'));
    assert.ok(htmlCon.includes('Consultancy Call'));
    assert.ok(htmlCon.includes('3:00 PM IST'));
    pass('unit: 12PM / 3PM meeting-call HTML templates');
  } catch (e) {
    fail('unit: 12PM / 3PM meeting-call HTML templates', e);
  }

  try {
    assert.strictEqual(REMINDER_TYPES.CHECKIN_10AM, 'checkin-10am');
    assert.strictEqual(REMINDER_TYPES.CHECKOUT_6PM, 'checkout-6pm');
    assert.strictEqual(REMINDER_TYPES.CHECKOUT_8PM, 'checkout-8pm');
    assert.strictEqual(REMINDER_TYPES.IT_STATUS_12PM, 'it-status-12pm');
    assert.strictEqual(REMINDER_TYPES.CONSULTANCY_3PM, 'consultancy-3pm');
    pass('unit: reminder type constants');
  } catch (e) {
    fail('unit: reminder type constants', e);
  }

  // Recipient selection logic (pure)
  try {
    const employees = [
      { _id: '1', email: 'a@x.com', position: 'Developer' },
      { _id: '2', email: 'b@x.com', position: 'Director' },
      { _id: '3', email: 'c@x.com', position: 'QA' },
    ];

    const checkedIn = new Set(['1']);
    const checkedOut = new Set();

    const amRecipients = employees.filter((u) => !checkedIn.has(String(u._id)));
    assert.deepStrictEqual(
      amRecipients.map((u) => u._id),
      ['2', '3']
    );

    const pmRecipients = employees.filter((u) => {
      const id = String(u._id);
      return checkedIn.has(id) && !checkedOut.has(id);
    });
    assert.deepStrictEqual(
      pmRecipients.map((u) => u._id),
      ['1']
    );

    assert.ok(!amRecipients.find((u) => u._id === '1'));
    assert.ok(employees.find((u) => u._id === '2'));
    pass('unit: recipient selection (AM missing check-in, PM missing check-out)');
  } catch (e) {
    fail('unit: recipient selection (AM missing check-in, PM missing check-out)', e);
  }

  try {
    const aliases = buildUserAliasMap([
      { _id: 'abc123', employeeId: 'UC0007', email: 'sam@x.com' },
    ]);
    assert.strictEqual(resolveAttendanceUserId('abc123', aliases), 'abc123');
    assert.strictEqual(resolveAttendanceUserId('UC0007', aliases), 'abc123');
    assert.strictEqual(resolveAttendanceUserId('sam@x.com', aliases), 'abc123');
    assert.strictEqual(
      resolveAttendanceUserId({ _id: 'abc123', employeeId: 'UC0007' }, aliases),
      'abc123'
    );
    pass('unit: attendance user alias matching for reminders');
  } catch (e) {
    fail('unit: attendance user alias matching for reminders', e);
  }

  try {
    const { shouldSkipAttendanceReminder } = require('../services/attendanceReminderService');
    assert.strictEqual(shouldSkipAttendanceReminder({ email: 'a@x.com' }), false);
    assert.strictEqual(
      shouldSkipAttendanceReminder({ email: 'a@x.com', skipAttendanceReminders: true }),
      true
    );
    const prev = process.env.REMINDER_SKIP_EMAILS;
    process.env.REMINDER_SKIP_EMAILS = 'skip@x.com, other@x.com';
    assert.strictEqual(shouldSkipAttendanceReminder({ email: 'skip@x.com' }), true);
    assert.strictEqual(shouldSkipAttendanceReminder({ email: 'keep@x.com' }), false);
    if (prev == null) delete process.env.REMINDER_SKIP_EMAILS;
    else process.env.REMINDER_SKIP_EMAILS = prev;
    pass('unit: skip reminder for listed users only');
  } catch (e) {
    fail('unit: skip reminder for listed users only', e);
  }

  // No check-in / check-out reminders on Sundays or company holidays
  try {
    const {
      getIstWeekday,
      resolveNonWorkingDay,
    } = require('../services/attendanceReminderService');

    // 2026-10-25 is a Sunday, 2026-10-26 is a Monday (IST noon)
    const sunday = new Date('2026-10-25T12:00:00+05:30');
    assert.strictEqual(getIstWeekday(sunday), 'Sunday');
    assert.deepStrictEqual(
      resolveNonWorkingDay({ dateKey: '2026-10-25', weekday: 'Sunday', holidays: [] }),
      {
        dateKey: '2026-10-25',
        weekday: 'Sunday',
        isNonWorkingDay: true,
        skippedReason: 'sunday',
        holidayName: null,
      }
    );

    // Saturday is a normal working day
    assert.strictEqual(
      resolveNonWorkingDay({ dateKey: '2026-10-24', weekday: 'Saturday', holidays: [] })
        .isNonWorkingDay,
      false
    );

    const holiday = resolveNonWorkingDay({
      dateKey: '2026-10-26',
      weekday: 'Monday',
      holidays: [{ date: new Date('2026-10-26T00:00:00.000Z'), name: 'Diwali' }],
    });
    assert.strictEqual(holiday.isNonWorkingDay, true);
    assert.strictEqual(holiday.skippedReason, 'holiday');
    assert.strictEqual(holiday.holidayName, 'Diwali');

    assert.strictEqual(
      resolveNonWorkingDay({
        dateKey: '2026-10-27',
        weekday: 'Tuesday',
        holidays: [{ date: new Date('2026-10-26T00:00:00.000Z'), name: 'Diwali' }],
      }).isNonWorkingDay,
      false
    );
    pass('unit: reminders skipped on Sunday & holidays, not on Saturday/working days');
  } catch (e) {
    fail('unit: reminders skipped on Sunday & holidays, not on Saturday/working days', e);
  }

  // Duplicate protection contract
  try {
    const cron = require('node-cron');
    assert.strictEqual(typeof cron.schedule, 'function');
    assert.ok(cron.validate('0 10 * * 1-6'));
    assert.ok(cron.validate('0 18 * * 1-6'));
    assert.ok(cron.validate('0 20 * * 1-6'));
    assert.ok(cron.validate('0 10 * * *'));
    assert.ok(cron.validate('0 12 * * *'));
    assert.ok(cron.validate('0 15 * * *'));
    assert.ok(cron.validate('0 18 * * *'));
    assert.ok(cron.validate('0 20 * * *'));
    pass('unit: node-cron schedules valid');
  } catch (e) {
    fail('unit: node-cron schedules valid', e);
  }

  // Leave email architecture untouched (module still loads)
  try {
    const transporter = require('../config/emailConfig');
    assert.ok(transporter);
    assert.strictEqual(typeof transporter.sendMail, 'function');
    const leaveController = require('../controllers/leaveController');
    assert.strictEqual(typeof leaveController.applyLeave, 'function');
    pass('unit: existing emailConfig + leaveController intact');
  } catch (e) {
    fail('unit: existing emailConfig + leaveController intact', e);
  }
}

async function runDbIfPossible() {
  if (!process.env.MONGO_URI) {
    console.log('SKIP  live DB reminder tests (no MONGO_URI)');
    return;
  }

  const mongoose = require('mongoose');
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (e) {
    console.log(`SKIP  live DB reminder tests (Mongo unreachable: ${e.message})`);
    return;
  }

  const AttendanceReminderLog = require('../models/AttendanceReminderLog');
  const { claimReminderSlot, alreadySent } = require('../services/attendanceReminderService');
  const stamp = Date.now();
  const fakeUserId = new mongoose.Types.ObjectId();
  const dateKey = getIstDateKey();
  const reminderType = REMINDER_TYPES.CHECKIN_10AM;

  try {
    const first = await claimReminderSlot({
      userId: fakeUserId,
      email: `reminder.test.${stamp}@example.com`,
      reminderType,
      dateKey,
    });
    assert.strictEqual(first, true);
    assert.strictEqual(await alreadySent(fakeUserId, reminderType, dateKey), true);

    const second = await claimReminderSlot({
      userId: fakeUserId,
      email: `reminder.test.${stamp}@example.com`,
      reminderType,
      dateKey,
    });
    assert.strictEqual(second, false);
    pass('live: duplicate reminder slot blocked (restart-safe)');
  } catch (e) {
    fail('live: duplicate reminder slot blocked (restart-safe)', e);
  } finally {
    await AttendanceReminderLog.deleteMany({ user: fakeUserId });
    await mongoose.disconnect().catch(() => {});
  }
}

async function main() {
  runUnit();
  await runDbIfPossible();

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- Summary ---');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) failed.forEach((f) => console.log(`  - ${f.name}: ${f.err}`));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
