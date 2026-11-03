const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const AttendanceReminderLog = require('../models/AttendanceReminderLog');
const transporter = require('../config/emailConfig');
const {
  getSenderFromAddress,
  assertEmailConfigured,
} = require('../config/emailConfig');
const {
  URLS,
  buildCheckInReminderHtml,
  buildCheckoutReminderHtml,
  buildItStatusCallReminderHtml,
  buildConsultancyCallReminderHtml,
} = require('../utils/attendanceReminderEmails');
const {
  skipsCheckInOut,
  skipsAttendanceReports,
} = require('../utils/skipAttendance');

const TIMEZONE = 'Asia/Kolkata';

const REMINDER_TYPES = {
  CHECKIN_10AM: 'checkin-10am',
  CHECKOUT_6PM: 'checkout-6pm',
  CHECKOUT_8PM: 'checkout-8pm',
  IT_STATUS_12PM: 'it-status-12pm',
  CONSULTANCY_3PM: 'consultancy-3pm',
};

const getIstDateKey = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const getTodayBoundsUtc = (now = new Date()) => {
  const dateKey = getIstDateKey(now);
  const start = new Date(`${dateKey}T00:00:00+05:30`);
  const end = new Date(`${dateKey}T23:59:59.999+05:30`);
  return { start, end, dateKey };
};

const getIstWeekday = (date = new Date()) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
  }).format(date);

/**
 * Check-in / check-out reminders must not go out on non-working days:
 * Sunday (weekly off — Saturday is a normal working day) or a company
 * holiday from the Holiday collection. Holiday dates are matched by IST
 * date key, same as missedAttendanceLockService, so how the date was
 * stored (UTC / IST midnight) does not matter.
 */
const resolveNonWorkingDay = ({ dateKey, weekday, holidays = [] } = {}) => {
  if (weekday === 'Sunday') {
    return {
      dateKey,
      weekday,
      isNonWorkingDay: true,
      skippedReason: 'sunday',
      holidayName: null,
    };
  }

  const holiday = (holidays || []).find(
    (entry) => entry?.date && getIstDateKey(new Date(entry.date)) === dateKey
  );
  if (holiday) {
    return {
      dateKey,
      weekday,
      isNonWorkingDay: true,
      skippedReason: 'holiday',
      holidayName: holiday.name || null,
    };
  }

  return {
    dateKey,
    weekday,
    isNonWorkingDay: false,
    skippedReason: null,
    holidayName: null,
  };
};

const getNonWorkingDayInfo = async (now = new Date()) => {
  const dateKey = getIstDateKey(now);
  const weekday = getIstWeekday(now);

  // Sunday needs no DB lookup.
  if (weekday === 'Sunday') {
    return resolveNonWorkingDay({ dateKey, weekday });
  }

  const holidays = await Holiday.find({}).select('date name').lean();
  return resolveNonWorkingDay({ dateKey, weekday, holidays });
};

const isDirectorUser = (user) => {
  const values = [user?.position];
  if (Array.isArray(user?.works)) {
    for (const work of user.works) {
      if (work?.position) values.push(work.position);
    }
  }
  return values.some((value) => String(value || '').trim().toLowerCase() === 'director');
};

const hasUsableEmail = (user) =>
  typeof user?.email === 'string' && user.email.trim().length > 0;

/**
 * Active employees eligible for monthly reports
 * (excludes Directors / Founders / Management / Freelancer, admins, inactive).
 */
const getEligibleEmployees = async () => {
  const users = await User.find({
    role: 'employee',
    isActive: { $ne: false },
    email: { $exists: true, $nin: [null, ''] },
  })
    .select('_id name email position department works role isActive employeeId')
    .lean();

  return users.filter(
    (user) => hasUsableEmail(user) && !skipsAttendanceReports(user)
  );
};

const isSystemAdminUser = (user) =>
  String(user?.name || '').trim() === 'Admin' || String(user?.role || '') === 'admin';

/**
 * Attendance reminder recipients: every active user with email.
 * Directors / other roles included. System Admin account excluded.
 */
const getAttendanceReminderRecipients = async () => {
  const users = await User.find({
    isActive: { $ne: false },
    name: { $ne: 'Admin' },
    role: { $ne: 'admin' },
    email: { $exists: true, $nin: [null, ''] },
  })
    .select(
      '_id name email position department works role isActive employeeId skipAttendanceReminders'
    )
    .lean();

  return users.filter(
    (user) => hasUsableEmail(user) && !isSystemAdminUser(user) && !shouldSkipAttendanceReminder(user)
  );
};

const parseSkipEmails = () =>
  String(process.env.REMINDER_SKIP_EMAILS || '')
    .split(/[,;\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const shouldSkipAttendanceReminder = (user) => {
  if (!user) return true;
  if (user.skipAttendanceReminders === true) return true;
  if (skipsCheckInOut(user)) return true;
  const email = String(user.email || '').trim().toLowerCase();
  return Boolean(email && parseSkipEmails().includes(email));
};

const aliasKeysForUser = (user) => {
  const keys = [];
  if (user?._id != null) keys.push(String(user._id));
  if (user?.employeeId) keys.push(String(user.employeeId).trim());
  if (user?.email) keys.push(String(user.email).trim().toLowerCase());
  return keys.filter(Boolean);
};

const buildUserAliasMap = (users) => {
  const aliases = new Map();
  for (const user of users) {
    const id = String(user._id);
    for (const key of aliasKeysForUser(user)) {
      aliases.set(key, id);
      aliases.set(key.toLowerCase(), id);
    }
  }
  return aliases;
};

const resolveAttendanceUserId = (userRef, aliases) => {
  if (userRef == null) return null;

  const candidates = [];
  if (typeof userRef === 'object') {
    if (userRef._id != null) candidates.push(String(userRef._id));
    if (userRef.employeeId) candidates.push(String(userRef.employeeId).trim());
    if (userRef.email) candidates.push(String(userRef.email).trim().toLowerCase());
  } else {
    candidates.push(String(userRef).trim());
  }

  for (const raw of candidates) {
    if (!raw || raw === '[object Object]') continue;
    if (aliases?.has(raw)) return aliases.get(raw);
    const lower = raw.toLowerCase();
    if (aliases?.has(lower)) return aliases.get(lower);
  }

  const fallback = candidates.find((raw) => raw && raw !== '[object Object]');
  return fallback || null;
};

/**
 * Build today's check-in / check-out sets from Attendance.
 * Matches Mongo _id, employeeId (UC0001), and email so checkout mail
 * still goes to people whose attendance row used a legacy user ref.
 */
const getTodayAttendanceSets = async (now = new Date()) => {
  const { start, end, dateKey } = getTodayBoundsUtc(now);
  const users = await User.find({
    isActive: { $ne: false },
    name: { $ne: 'Admin' },
  })
    .select('_id employeeId email')
    .lean();
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

  return { checkedIn, checkedOut, dateKey, start, end };
};

const alreadySent = async (userId, reminderType, dateKey) => {
  const existing = await AttendanceReminderLog.findOne({
    user: userId,
    reminderType,
    dateKey,
    status: 'sent',
  })
    .select('_id')
    .lean();
  return Boolean(existing);
};

/**
 * Reserve a unique send slot. Returns false if already successfully sent.
 * Failed prior attempts can be retried the same day.
 */
const claimReminderSlot = async ({ userId, email, reminderType, dateKey }) => {
  const existing = await AttendanceReminderLog.findOne({
    user: userId,
    reminderType,
    dateKey,
  });

  if (existing && existing.status === 'sent') {
    return false;
  }

  if (existing) {
    existing.email = email;
    existing.status = 'sent';
    existing.errorMessage = '';
    existing.sentAt = new Date();
    await existing.save();
    return true;
  }

  try {
    await AttendanceReminderLog.create({
      user: userId,
      email,
      reminderType,
      dateKey,
      status: 'sent',
      sentAt: new Date(),
    });
    return true;
  } catch (err) {
    // Race: another worker claimed the unique slot
    if (err && (err.code === 11000 || err.code === '11000')) {
      return false;
    }
    throw err;
  }
};

const markReminderFailed = async ({ userId, reminderType, dateKey, errorMessage }) => {
  await AttendanceReminderLog.findOneAndUpdate(
    { user: userId, reminderType, dateKey },
    {
      $set: {
        status: 'failed',
        errorMessage: String(errorMessage || '').slice(0, 500),
      },
    }
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sendMail = async ({ to, subject, html }) => {
  assertEmailConfigured();

  const payload = {
    from: getSenderFromAddress(),
    to,
    subject,
    html,
  };

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await transporter.sendMail(payload);
    } catch (err) {
      lastErr = err;
      console.error(`[AttendanceReminder] SMTP attempt ${attempt}/3 to ${to}: ${err.message}`);
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  throw lastErr;
};

const sendOneReminder = async ({
  user,
  reminderType,
  dateKey,
  subject,
  html,
  dryRun = false,
}) => {
  const userId = user._id;

  if (await alreadySent(userId, reminderType, dateKey)) {
    return { status: 'skipped_duplicate', userId: String(userId), email: user.email };
  }

  if (dryRun) {
    return { status: 'dry_run', userId: String(userId), email: user.email };
  }

  const claimed = await claimReminderSlot({
    userId,
    email: user.email,
    reminderType,
    dateKey,
  });
  if (!claimed) {
    return { status: 'skipped_duplicate', userId: String(userId), email: user.email };
  }

  try {
    await sendMail({ to: user.email, subject, html });
    return { status: 'sent', userId: String(userId), email: user.email };
  } catch (err) {
    await markReminderFailed({
      userId,
      reminderType,
      dateKey,
      errorMessage: err.message,
    });
    return {
      status: 'failed',
      userId: String(userId),
      email: user.email,
      error: err.message,
    };
  }
};

/**
 * Reminder #1 — 10:00 AM IST
 * All active staff with email, no check-in today.
 */
const runCheckInReminder = async ({ now = new Date(), dryRun = false } = {}) => {
  const nonWorkingDay = await getNonWorkingDayInfo(now);
  if (nonWorkingDay.isNonWorkingDay) {
    return {
      reminderType: REMINDER_TYPES.CHECKIN_10AM,
      dateKey: nonWorkingDay.dateKey,
      candidateCount: 0,
      results: [],
      skipped: true,
      skippedReason: nonWorkingDay.skippedReason,
      holidayName: nonWorkingDay.holidayName,
      weekday: nonWorkingDay.weekday,
    };
  }

  const employees = await getAttendanceReminderRecipients();
  const { checkedIn, dateKey } = await getTodayAttendanceSets(now);
  const recipients = employees.filter((u) => !checkedIn.has(String(u._id)));

  const results = [];
  for (const user of recipients) {
    const result = await sendOneReminder({
      user,
      reminderType: REMINDER_TYPES.CHECKIN_10AM,
      dateKey,
      subject: 'Reminder: Please Complete Your Check-In',
      html: buildCheckInReminderHtml(user.name),
      dryRun,
    });
    results.push(result);
  }

  return {
    reminderType: REMINDER_TYPES.CHECKIN_10AM,
    dateKey,
    candidateCount: recipients.length,
    results,
  };
};

/**
 * Reminder #2 / #3 — checked in today, not checked out yet.
 */
const runCheckoutReminder = async (
  reminderType,
  { now = new Date(), dryRun = false, finalReminder = false } = {}
) => {
  const nonWorkingDay = await getNonWorkingDayInfo(now);
  if (nonWorkingDay.isNonWorkingDay) {
    return {
      reminderType,
      dateKey: nonWorkingDay.dateKey,
      candidateCount: 0,
      results: [],
      skipped: true,
      skippedReason: nonWorkingDay.skippedReason,
      holidayName: nonWorkingDay.holidayName,
      weekday: nonWorkingDay.weekday,
    };
  }

  const employees = await getAttendanceReminderRecipients();
  const { checkedIn, checkedOut, dateKey } = await getTodayAttendanceSets(now);

  const recipients = employees.filter((u) => {
    const id = String(u._id);
    return checkedIn.has(id) && !checkedOut.has(id);
  });

  const subject = finalReminder
    ? 'Final Reminder: Pending Check-Out'
    : 'Reminder: Please Complete Your Check-Out';

  const results = [];
  for (const user of recipients) {
    const result = await sendOneReminder({
      user,
      reminderType,
      dateKey,
      subject,
      html: buildCheckoutReminderHtml(user.name, { finalReminder }),
      dryRun,
    });
    results.push(result);
  }

  return {
    reminderType,
    dateKey,
    candidateCount: recipients.length,
    results,
  };
};

const runCheckout6pmReminder = (opts) =>
  runCheckoutReminder(REMINDER_TYPES.CHECKOUT_6PM, {
    ...opts,
    finalReminder: false,
  });

const runCheckout8pmReminder = (opts) =>
  runCheckoutReminder(REMINDER_TYPES.CHECKOUT_8PM, {
    ...opts,
    finalReminder: true,
  });

/**
 * Broadcast meeting-call reminders to all eligible employees (not attendance-gated).
 */
const runMeetingCallReminder = async (
  reminderType,
  { subject, buildHtml, now = new Date(), dryRun = false } = {}
) => {
  const employees = await getEligibleEmployees();
  const { dateKey } = getTodayBoundsUtc(now);

  const results = [];
  for (const user of employees) {
    const result = await sendOneReminder({
      user,
      reminderType,
      dateKey,
      subject,
      html: buildHtml(user.name),
      dryRun,
    });
    results.push(result);
  }

  return {
    reminderType,
    dateKey,
    candidateCount: employees.length,
    results,
  };
};

/** 12:00 PM IST — IT Status Call reminder */
const runItStatusCallReminder = (opts) =>
  runMeetingCallReminder(REMINDER_TYPES.IT_STATUS_12PM, {
    ...opts,
    subject: 'Reminder: IT Status Call at 12:00 PM',
    buildHtml: buildItStatusCallReminderHtml,
  });

/** 3:00 PM IST — Consultancy Call reminder */
const runConsultancyCallReminder = (opts) =>
  runMeetingCallReminder(REMINDER_TYPES.CONSULTANCY_3PM, {
    ...opts,
    subject: 'Reminder: Consultancy Call at 3:00 PM',
    buildHtml: buildConsultancyCallReminderHtml,
  });

module.exports = {
  TIMEZONE,
  getSenderFromAddress,
  REMINDER_TYPES,
  URLS,
  getIstDateKey,
  getIstWeekday,
  resolveNonWorkingDay,
  getNonWorkingDayInfo,
  getTodayBoundsUtc,
  isDirectorUser,
  getEligibleEmployees,
  getAttendanceReminderRecipients,
  shouldSkipAttendanceReminder,
  buildUserAliasMap,
  resolveAttendanceUserId,
  getTodayAttendanceSets,
  alreadySent,
  claimReminderSlot,
  runCheckInReminder,
  runCheckout6pmReminder,
  runCheckout8pmReminder,
  runItStatusCallReminder,
  runConsultancyCallReminder,
};
