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
const { skipsCheckInOut } = require('../utils/skipAttendance');
const {
  getIstDateKey,
  dateKeyBounds,
  findCompletedWorkingDate,
  isUserScheduledOff,
  wasEmployedOnDate,
  leaveCoversDateKey,
} = require('../utils/missedAttendanceLock');
const {
  isEnabled,
  pushAttendanceToSeyal,
} = require('./seyalAttendanceService');

const skipsSeyalAbsent = (user) =>
  isDirectorUser(user) || skipsCheckInOut(user);

const holidayDateKeys = (holidays) => {
  const keys = new Set();
  for (const holiday of holidays || []) {
    if (!holiday?.date) continue;
    keys.add(getIstDateKey(new Date(holiday.date)));
  }
  return keys;
};

const eligibleEmployees = async () => {
  const users = await User.find({
    role: 'employee',
    isActive: { $ne: false },
    name: { $ne: 'Admin' },
  }).select(
    '_id name email employeeId role position department works isActive dateOfJoining dateOfRelieving'
  );

  return users.filter((user) => !skipsSeyalAbsent(user) && user.email);
};

const checkedInUserIds = async (dateKey, users) => {
  const { start, end } = dateKeyBounds(dateKey);
  const aliases = buildUserAliasMap(users);
  const rows = await Attendance.find({
    timestamp: { $gte: start, $lte: end },
    type: 'check-in',
  })
    .select('user')
    .lean();

  const ids = new Set();
  for (const row of rows) {
    const id = resolveAttendanceUserId(row.user, aliases);
    if (id) ids.add(id);
  }
  return ids;
};

/** Only Approved leave counts as covered for Seyal absent. */
const approvedLeaveUserIds = async (dateKey) => {
  const { start, end } = dateKeyBounds(dateKey);
  const leaves = await LeaveRequest.find({
    status: 'Approved',
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

/**
 * Nightly catch-up: push absent for employees with no check-in and no approved leave
 * on the last completed working day.
 */
const runSeyalAbsentCatchUp = async ({ now = new Date(), dryRun = false } = {}) => {
  if (process.env.SEYAL_ABSENT_CATCHUP_ENABLED === 'false') {
    return { enabled: false, pushed: [], dateKey: null };
  }
  if (!isEnabled()) {
    return { enabled: false, reason: 'seyal_disabled', pushed: [], dateKey: null };
  }

  const holidays = await Holiday.find({}).select('date').lean();
  const holidayKeys = holidayDateKeys(holidays);
  const target = findCompletedWorkingDate(now, holidayKeys);
  if (!target) {
    return { enabled: true, pushed: [], dateKey: null, reason: 'no-working-day' };
  }

  const users = await eligibleEmployees();
  const [checkedIn, onLeave, schedules] = await Promise.all([
    checkedInUserIds(target.dateKey, users),
    approvedLeaveUserIds(target.dateKey),
    scheduleByUserId(users.map((u) => u._id)),
  ]);

  const records = [];
  for (const user of users) {
    const id = String(user._id);
    if (!wasEmployedOnDate(user, target.dateKey)) continue;
    if (isUserScheduledOff(schedules.get(id), target.weekday)) continue;
    if (checkedIn.has(id)) continue;
    if (onLeave.has(id)) continue;

    records.push({
      email: String(user.email).trim().toLowerCase(),
      date: target.dateKey,
      status: 'absent',
    });
  }

  if (!records.length) {
    return {
      enabled: true,
      dateKey: target.dateKey,
      pushed: [],
      pushedCount: 0,
      candidateCount: 0,
    };
  }

  if (dryRun) {
    return {
      enabled: true,
      dateKey: target.dateKey,
      pushed: records,
      pushedCount: records.length,
      candidateCount: records.length,
      dryRun: true,
    };
  }

  // Batch up to 500 per request (Seyal limit).
  const results = [];
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const result = await pushAttendanceToSeyal(chunk);
    results.push(result);
  }

  return {
    enabled: true,
    dateKey: target.dateKey,
    pushed: records,
    pushedCount: records.length,
    candidateCount: records.length,
    results,
  };
};

module.exports = {
  runSeyalAbsentCatchUp,
};
