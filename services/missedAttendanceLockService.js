const User = require('../models/User');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const Holiday = require('../models/Holiday');
const Schedule = require('../models/Schedule');
const {
  isDirectorUser,
  buildUserAliasMap,
  resolveAttendanceUserId,
} = require('./attendanceReminderService');
const {
  INOUT_BLOCKED_MESSAGE,
  getIstDateKey,
  dateKeyBounds,
  findCompletedWorkingDate,
  isUserScheduledOff,
  wasEmployedOnDate,
  leaveCoversDateKey,
  shouldLockMissedDay,
} = require('../utils/missedAttendanceLock');

const holidayDateKeys = (holidays) => {
  const keys = new Set();
  for (const holiday of holidays || []) {
    if (!holiday?.date) continue;
    keys.add(getIstDateKey(new Date(holiday.date)));
  }
  return keys;
};

const loadHolidayKeys = async () => {
  const holidays = await Holiday.find({}).select('date').lean();
  return holidayDateKeys(holidays);
};

const eligibleEmployees = async () => {
  const users = await User.find({
    role: 'employee',
    isActive: { $ne: false },
    name: { $ne: 'Admin' },
  }).select(
    '_id name email employeeId role position works isActive dateOfJoining dateOfRelieving inoutBlocked inoutBlockedAt inoutBlockedForDate inoutLockWaivedForDate'
  );

  return users.filter((user) => !isDirectorUser(user));
};

const attendanceSetsForDate = async (dateKey, users) => {
  const { start, end } = dateKeyBounds(dateKey);
  const aliases = buildUserAliasMap(users);
  const rows = await Attendance.find({
    timestamp: { $gte: start, $lte: end },
    type: { $in: ['check-in', 'check-out'] },
  })
    .select('user type')
    .lean();

  const checkedIn = new Set();
  const checkedOut = new Set();
  for (const row of rows) {
    const id = resolveAttendanceUserId(row.user, aliases);
    if (!id) continue;
    if (row.type === 'check-in') checkedIn.add(id);
    if (row.type === 'check-out') checkedOut.add(id);
  }
  return { checkedIn, checkedOut };
};

const leaveUserIdsForDate = async (dateKey) => {
  const { start, end } = dateKeyBounds(dateKey);
  const leaves = await LeaveRequest.find({
    fromDate: { $lte: end },
    toDate: { $gte: start },
  })
    .select('user fromDate toDate')
    .lean();

  const ids = new Set();
  for (const leave of leaves) {
    if (!leaveCoversDateKey(leave, dateKey)) continue;
    if (leave.user) ids.add(String(leave.user));
  }
  return ids;
};

const scheduleByUserId = async (userIds) => {
  const rows = await Schedule.find({ user: { $in: userIds } })
    .select('user weeklySchedule')
    .lean();
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.user), row.weeklySchedule || null);
  }
  return map;
};

const releaseLockAfterCheckIn = async (user) => {
  const waivedFor = user.inoutBlockedForDate || user.inoutLockWaivedForDate || null;
  user.inoutBlocked = false;
  user.inoutBlockedAt = null;
  user.inoutBlockedForDate = null;
  user.inoutLockWaivedForDate = waivedFor;
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        inoutBlocked: false,
        inoutBlockedAt: null,
        inoutBlockedForDate: null,
        inoutLockWaivedForDate: waivedFor,
      },
    }
  );
  return user;
};

const lockUser = async (user, dateKey, now) => {
  user.inoutBlocked = true;
  user.inoutBlockedAt = now;
  user.inoutBlockedForDate = dateKey;
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        inoutBlocked: true,
        inoutBlockedAt: now,
        inoutBlockedForDate: dateKey,
      },
    }
  );
};

/**
 * Lock active employees who missed check-in, check-out, and a leave request
 * on the last completed working day.
 */
const runMissedAttendanceLock = async ({ now = new Date(), dryRun = false } = {}) => {
  if (process.env.MISSED_ATTENDANCE_LOCK_ENABLED === 'false') {
    return { enabled: false, locked: [], dateKey: null };
  }

  const holidayKeys = await loadHolidayKeys();
  const target = findCompletedWorkingDate(now, holidayKeys);
  if (!target) {
    return { enabled: true, locked: [], dateKey: null, reason: 'no-working-day' };
  }

  const users = await eligibleEmployees();
  const todayKey = getIstDateKey(now);
  const [attendance, todayAttendance, leaveIds, schedules] = await Promise.all([
    attendanceSetsForDate(target.dateKey, users),
    target.dateKey === todayKey
      ? Promise.resolve(null)
      : attendanceSetsForDate(todayKey, users),
    leaveUserIdsForDate(target.dateKey),
    scheduleByUserId(users.map((user) => user._id)),
  ]);
  const checkedInToday = todayAttendance || attendance;

  const locked = [];
  const released = [];
  for (const user of users) {
    const id = String(user._id);
    const hasTodayCheckIn = checkedInToday.checkedIn.has(id);
    if (hasTodayCheckIn) {
      if (user.inoutBlocked && !dryRun) {
        await releaseLockAfterCheckIn(user);
        released.push({ userId: id, name: user.name, email: user.email });
      }
      continue;
    }
    if (user.inoutBlocked) continue;
    if (!wasEmployedOnDate(user, target.dateKey)) continue;
    if (isUserScheduledOff(schedules.get(id), target.weekday)) continue;

    const missed = shouldLockMissedDay({
      hasCheckIn: attendance.checkedIn.has(id),
      hasCheckOut: attendance.checkedOut.has(id),
      hasLeave: leaveIds.has(id),
      waived: user.inoutLockWaivedForDate === target.dateKey,
      checkedInToday: false,
    });
    if (!missed) continue;

    if (!dryRun) {
      await lockUser(user, target.dateKey, now);
    }
    locked.push({
      userId: id,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId || '',
      dateKey: target.dateKey,
    });
  }

  return {
    enabled: true,
    dateKey: target.dateKey,
    weekday: target.weekday,
    candidateCount: users.length,
    lockedCount: locked.length,
    locked,
    releasedCount: released.length,
    released,
    dryRun,
  };
};

/**
 * A check-in already recorded today means this employee is not absent.
 * Clears a lock that was applied for an earlier day after they had checked in.
 */
const releaseLockIfCheckedInToday = async (user, now = new Date()) => {
  if (!user?.inoutBlocked) return user;
  if (String(user.role || '') === 'admin' || isDirectorUser(user)) return user;
  const todayKey = getIstDateKey(now);
  const todayAttendance = await attendanceSetsForDate(todayKey, [user]);
  if (!todayAttendance.checkedIn.has(String(user._id))) return user;
  return releaseLockAfterCheckIn(user);
};

/**
 * Apply the missed-day lock before a punch.
 * A check-in already saved today is never treated as a missed day.
 */
const ensureUserMissedDayLock = async (user, now = new Date()) => {
  if (!user) return user;
  if (String(user.role || '') !== 'employee') return user;
  if (isDirectorUser(user)) return user;
  if (process.env.MISSED_ATTENDANCE_LOCK_ENABLED === 'false') return user;

  const todayKey = getIstDateKey(now);
  const todayAttendance = await attendanceSetsForDate(todayKey, [user]);
  if (todayAttendance.checkedIn.has(String(user._id))) {
    if (user.inoutBlocked) await releaseLockAfterCheckIn(user);
    return user;
  }

  if (user.inoutBlocked) return user;

  const holidayKeys = await loadHolidayKeys();
  const target = findCompletedWorkingDate(now, holidayKeys);
  if (!target) return user;
  if (!wasEmployedOnDate(user, target.dateKey)) return user;
  if (user.inoutLockWaivedForDate === target.dateKey) return user;

  const schedules = await scheduleByUserId([user._id]);
  if (isUserScheduledOff(schedules.get(String(user._id)), target.weekday)) return user;

  const [attendance, leaveIds] = await Promise.all([
    attendanceSetsForDate(target.dateKey, [user]),
    leaveUserIdsForDate(target.dateKey),
  ]);
  const id = String(user._id);
  const missed = shouldLockMissedDay({
    hasCheckIn: attendance.checkedIn.has(id),
    hasCheckOut: attendance.checkedOut.has(id),
    hasLeave: leaveIds.has(id),
    waived: false,
  });
  if (!missed) return user;

  await lockUser(user, target.dateKey, now);
  return user;
};

module.exports = {
  INOUT_BLOCKED_MESSAGE,
  runMissedAttendanceLock,
  ensureUserMissedDayLock,
  releaseLockIfCheckedInToday,
};
