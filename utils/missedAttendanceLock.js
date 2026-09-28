const TIMEZONE = 'Asia/Kolkata';

const INOUT_BLOCKED_MESSAGE =
  'Your In-Out is locked because you did not check in, check out, or submit a leave request. Only an admin can unlock it.';

const getLockHour = () => {
  const raw = Number(process.env.MISSED_ATTENDANCE_LOCK_HOUR);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 23) return raw;
  return 21;
};

const getIstDateKey = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const getIstWeekday = (date = new Date()) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
  }).format(date);

const getIstHour = (date = new Date()) => {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return Number(hour);
};

const shiftDateKey = (dateKey, days) => {
  const base = new Date(`${dateKey}T12:00:00+05:30`);
  base.setTime(base.getTime() + days * 24 * 60 * 60 * 1000);
  return getIstDateKey(base);
};

const weekdayOfDateKey = (dateKey) => getIstWeekday(new Date(`${dateKey}T12:00:00+05:30`));

const dateKeyBounds = (dateKey) => ({
  start: new Date(`${dateKey}T00:00:00+05:30`),
  end: new Date(`${dateKey}T23:59:59.999+05:30`),
});

/** Sunday is the weekly off. Saturday is a normal working day. */
const isWeeklyOff = (weekday) => weekday === 'Sunday';

const toDateKey = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return getIstDateKey(date);
};

/**
 * Last company working day that is finished.
 * Before the lock hour, today is still open, so the search starts yesterday.
 */
const findCompletedWorkingDate = (now = new Date(), holidayKeys = new Set()) => {
  const todayKey = getIstDateKey(now);
  const pastCutoff = getIstHour(now) >= getLockHour();
  let cursor = pastCutoff ? todayKey : shiftDateKey(todayKey, -1);

  for (let i = 0; i < 21; i += 1) {
    const weekday = weekdayOfDateKey(cursor);
    if (!isWeeklyOff(weekday) && !holidayKeys.has(cursor)) {
      return { dateKey: cursor, weekday };
    }
    cursor = shiftDateKey(cursor, -1);
  }

  return null;
};

const isUserScheduledOff = (weeklySchedule, weekday) => {
  if (weekday === 'Saturday') return false;
  if (weekday === 'Sunday') return true;
  if (!weeklySchedule || !weekday) return false;
  return weeklySchedule[weekday]?.isLeave === true;
};

const wasEmployedOnDate = (user, dateKey) => {
  const joiningKey = toDateKey(user?.dateOfJoining);
  if (joiningKey && joiningKey > dateKey) return false;
  const relievingKey = toDateKey(user?.dateOfRelieving);
  if (relievingKey && relievingKey <= dateKey) return false;
  if (user?.isActive === false) return false;
  return true;
};

const leaveCoversDateKey = (leave, dateKey) => {
  if (!leave?.fromDate || !leave?.toDate) return false;
  const { start, end } = dateKeyBounds(dateKey);
  const from = new Date(leave.fromDate);
  const to = new Date(leave.toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
  return from <= end && to >= start;
};

const shouldLockMissedDay = ({ hasCheckIn, hasCheckOut, hasLeave, waived }) => {
  if (waived) return false;
  if (hasCheckIn || hasCheckOut || hasLeave) return false;
  return true;
};

const clearInoutBlock = (user) => {
  const wasBlocked = user.inoutBlocked === true;
  const waivedFor = user.inoutBlockedForDate || user.inoutLockWaivedForDate || null;
  user.inoutLockWaivedForDate = waivedFor;
  user.inoutBlocked = false;
  user.inoutBlockedAt = null;
  user.inoutBlockedForDate = null;
  if (wasBlocked) user.inoutUnlockNoticePending = true;
};

module.exports = {
  TIMEZONE,
  INOUT_BLOCKED_MESSAGE,
  getLockHour,
  getIstDateKey,
  getIstWeekday,
  getIstHour,
  shiftDateKey,
  weekdayOfDateKey,
  dateKeyBounds,
  isWeeklyOff,
  toDateKey,
  findCompletedWorkingDate,
  isUserScheduledOff,
  wasEmployedOnDate,
  leaveCoversDateKey,
  shouldLockMissedDay,
  clearInoutBlock,
};
