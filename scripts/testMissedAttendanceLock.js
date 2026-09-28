/**
 * Missed check-in / check-out / leave In-Out lock.
 * Run: node scripts/testMissedAttendanceLock.js
 */
require('dotenv').config();
const assert = require('assert');
const {
  findCompletedWorkingDate,
  shouldLockMissedDay,
  leaveCoversDateKey,
  wasEmployedOnDate,
  isUserScheduledOff,
  clearInoutBlock,
  shiftDateKey,
  getIstDateKey,
} = require('../utils/missedAttendanceLock');

const results = [];
const pass = (name) => {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
};
const fail = (name, err) => {
  results.push({ name, ok: false, err: String(err && err.message ? err.message : err) });
  console.error(`FAIL  ${name}:`, err && err.message ? err.message : err);
};

const mondayEvening = new Date('2026-09-28T16:30:00.000Z'); // 22:00 IST Monday
const tuesdayMorning = new Date('2026-09-29T04:30:00.000Z'); // 10:00 IST Tuesday

function run() {
  try {
    const evening = findCompletedWorkingDate(mondayEvening, new Set());
    assert.strictEqual(evening.dateKey, '2026-09-28');
    assert.strictEqual(evening.weekday, 'Monday');
    pass('unit: after 21:00 IST the lock date is today');
  } catch (e) {
    fail('unit: after 21:00 IST the lock date is today', e);
  }

  try {
    const morning = findCompletedWorkingDate(tuesdayMorning, new Set());
    assert.strictEqual(morning.dateKey, '2026-09-28');
    pass('unit: before cutoff the lock date is the previous working day');
  } catch (e) {
    fail('unit: before cutoff the lock date is the previous working day', e);
  }

  try {
    const mondayMorning = new Date('2026-09-28T04:30:00.000Z'); // 10:00 IST Monday
    const target = findCompletedWorkingDate(mondayMorning, new Set());
    assert.strictEqual(target.dateKey, '2026-09-26');
    assert.strictEqual(target.weekday, 'Saturday');
    pass('unit: Sunday is off and Saturday is a normal working day');
  } catch (e) {
    fail('unit: weekend days are skipped', e);
  }

  try {
    const evening = findCompletedWorkingDate(mondayEvening, new Set(['2026-09-28']));
    assert.strictEqual(evening.dateKey, '2026-09-26');
    assert.strictEqual(evening.weekday, 'Saturday');
    pass('unit: holidays are skipped');
  } catch (e) {
    fail('unit: holidays are skipped', e);
  }

  try {
    assert.strictEqual(
      shouldLockMissedDay({ hasCheckIn: false, hasCheckOut: false, hasLeave: false, waived: false }),
      true
    );
    assert.strictEqual(
      shouldLockMissedDay({
        hasCheckIn: false,
        hasCheckOut: false,
        hasLeave: false,
        waived: false,
        checkedInToday: true,
      }),
      false
    );
    assert.strictEqual(
      shouldLockMissedDay({ hasCheckIn: true, hasCheckOut: false, hasLeave: false, waived: false }),
      false
    );
    assert.strictEqual(
      shouldLockMissedDay({ hasCheckIn: false, hasCheckOut: true, hasLeave: false, waived: false }),
      false
    );
    assert.strictEqual(
      shouldLockMissedDay({ hasCheckIn: false, hasCheckOut: false, hasLeave: true, waived: false }),
      false
    );
    assert.strictEqual(
      shouldLockMissedDay({ hasCheckIn: false, hasCheckOut: false, hasLeave: false, waived: true }),
      false
    );
    pass('unit: lock only when check-in, check-out, and leave are all missing');
  } catch (e) {
    fail('unit: lock only when check-in, check-out, and leave are all missing', e);
  }

  try {
    const leave = {
      fromDate: new Date('2026-09-28T00:00:00.000Z'),
      toDate: new Date('2026-09-28T00:00:00.000Z'),
    };
    assert.strictEqual(leaveCoversDateKey(leave, '2026-09-28'), true);
    assert.strictEqual(leaveCoversDateKey(leave, '2026-09-29'), false);
    pass('unit: submitted leave covers that IST day');
  } catch (e) {
    fail('unit: submitted leave covers that IST day', e);
  }

  try {
    assert.strictEqual(
      wasEmployedOnDate({ dateOfJoining: new Date('2026-09-29T00:00:00+05:30'), isActive: true }, '2026-09-28'),
      false
    );
    assert.strictEqual(
      wasEmployedOnDate({ dateOfRelieving: new Date('2026-09-20T00:00:00+05:30'), isActive: true }, '2026-09-28'),
      false
    );
    assert.strictEqual(wasEmployedOnDate({ isActive: true }, '2026-09-28'), true);
    pass('unit: skip employees who had not joined or already left');
  } catch (e) {
    fail('unit: skip employees who had not joined or already left', e);
  }

  try {
    assert.strictEqual(isUserScheduledOff({ Monday: { isLeave: true } }, 'Monday'), true);
    assert.strictEqual(isUserScheduledOff({ Monday: { isLeave: false } }, 'Monday'), false);
    assert.strictEqual(isUserScheduledOff(null, 'Monday'), false);
    assert.strictEqual(isUserScheduledOff({ Saturday: { isLeave: true } }, 'Saturday'), false);
    pass('unit: weekly off is not a missed day');
  } catch (e) {
    fail('unit: weekly off is not a missed day', e);
  }

  try {
    const user = {
      inoutBlocked: true,
      inoutBlockedAt: new Date(),
      inoutBlockedForDate: '2026-09-28',
      inoutLockWaivedForDate: null,
    };
    clearInoutBlock(user);
    assert.strictEqual(user.inoutBlocked, false);
    assert.strictEqual(user.inoutBlockedAt, null);
    assert.strictEqual(user.inoutBlockedForDate, null);
    assert.strictEqual(user.inoutLockWaivedForDate, '2026-09-28');
    assert.strictEqual(user.inoutUnlockNoticePending, true);
    const alreadyOpen = { inoutBlocked: false, inoutUnlockNoticePending: false };
    clearInoutBlock(alreadyOpen);
    assert.strictEqual(alreadyOpen.inoutUnlockNoticePending, false);
    pass('unit: admin unlock clears the block and waives that date');
  } catch (e) {
    fail('unit: admin unlock clears the block and waives that date', e);
  }

  try {
    assert.strictEqual(shiftDateKey('2026-09-28', -1), '2026-09-27');
    assert.strictEqual(getIstDateKey(mondayEvening), '2026-09-28');
    pass('unit: IST date keys');
  } catch (e) {
    fail('unit: IST date keys', e);
  }
}

run();
const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
