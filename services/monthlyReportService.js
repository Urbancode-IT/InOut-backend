const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const Holiday = require('../models/Holiday');
const LeaveRequest = require('../models/LeaveRequest');
const Payslip = require('../models/Payslip');
const MonthlyReportLog = require('../models/MonthlyReportLog');
const transporter = require('../config/emailConfig');
const {
  getSenderFromAddress,
  assertEmailConfigured,
} = require('../config/emailConfig');
const { buildMonthlyReportHtml } = require('../utils/monthlyReportEmails');
const {
  TIMEZONE,
  getEligibleEmployees,
} = require('./attendanceReminderService');

/** Previous calendar month in IST relative to `now`. */
const getPreviousMonthMeta = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === 'year').value);
  const month = Number(parts.find((p) => p.type === 'month').value); // 1-12
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const monthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  const monthStart = new Date(`${monthKey}-01T00:00:00+05:30`);
  const daysInMonth = new Date(prevYear, prevMonth, 0).getDate();
  const monthEnd = new Date(
    `${monthKey}-${String(daysInMonth).padStart(2, '0')}T23:59:59.999+05:30`
  );

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    month: 'long',
    year: 'numeric',
  }).format(monthStart);

  return {
    year: prevYear,
    month: prevMonth,
    monthKey,
    monthLabel,
    monthStart,
    monthEnd,
    daysInMonth,
  };
};

const formatTimeIst = (date) => {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

const formatDateLabel = (date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);

const toDateKeyIst = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const holidayDateKeys = (holidays) => {
  const set = new Set();
  for (const h of holidays) {
    if (!h?.date) continue;
    set.add(toDateKeyIst(new Date(h.date)));
  }
  return set;
};

const leaveCoversDate = (leaves, dateObj) => {
  const key = toDateKeyIst(dateObj);
  const dayStart = new Date(`${key}T00:00:00+05:30`);
  const dayEnd = new Date(`${key}T23:59:59.999+05:30`);
  return leaves.some((leave) => {
    const from = new Date(leave.fromDate);
    const to = new Date(leave.toDate);
    return from <= dayEnd && to >= dayStart;
  });
};

const DEFAULT_WEEKLY_SCHEDULE = {
  Monday: { start: '09:00', end: '18:00', isLeave: false },
  Tuesday: { start: '09:00', end: '18:00', isLeave: false },
  Wednesday: { start: '09:00', end: '18:00', isLeave: false },
  Thursday: { start: '09:00', end: '18:00', isLeave: false },
  Friday: { start: '09:00', end: '18:00', isLeave: false },
  Saturday: { start: '09:00', end: '18:00', isLeave: true },
  Sunday: { start: '09:00', end: '18:00', isLeave: true },
};

/**
 * Build per-day attendance for one employee for a given month.
 * Aligns with frontend PayslipGenerator rules (weekends / scheduled off / late / half-day).
 */
const buildEmployeeAttendance = ({
  logs,
  weeklySchedule,
  holidayKeys,
  approvedLeaves,
  monthMeta,
}) => {
  const { year, month, daysInMonth, monthLabel } = monthMeta;
  const schedule =
    weeklySchedule && Object.keys(weeklySchedule).length > 0
      ? weeklySchedule
      : DEFAULT_WEEKLY_SCHEDULE;
  const grouped = {};

  for (const log of logs) {
    const ts = new Date(log.timestamp);
    const key = toDateKeyIst(ts);
    if (!grouped[key]) grouped[key] = { checkIn: null, checkOut: null };
    if (log.type === 'check-in') {
      if (!grouped[key].checkIn || ts < new Date(grouped[key].checkIn.timestamp)) {
        grouped[key].checkIn = log;
      }
    }
    if (log.type === 'check-out') {
      if (!grouped[key].checkOut || ts > new Date(grouped[key].checkOut.timestamp)) {
        grouped[key].checkOut = log;
      }
    }
  }

  let workingDays = 0;
  let presentDays = 0;
  let leaveDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let offDays = 0;
  const days = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(`${dateKey}T12:00:00+05:30`);
    const dayName = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      weekday: 'long',
    }).format(dateObj);
    const scheduled = schedule?.[dayName];
    const isWeekend = dayName === 'Saturday' || dayName === 'Sunday';
    const isHoliday = holidayKeys.has(dateKey);
    const onLeave = leaveCoversDate(approvedLeaves, dateObj);
    const attendance = grouped[dateKey];

    let status = 'Off';
    let checkIn = '';
    let checkOut = '';

    if (!scheduled || scheduled.isLeave || isWeekend || isHoliday) {
      if (scheduled?.isLeave && !isWeekend && !isHoliday) {
        leaveDays++;
        status = 'Leave';
      } else if (onLeave) {
        leaveDays++;
        status = 'Leave';
      } else if (isHoliday) {
        offDays++;
        status = 'Holiday';
      } else {
        offDays++;
        status = isWeekend ? 'Weekend' : 'Weekly Off';
      }
    } else if (onLeave && !attendance?.checkIn) {
      leaveDays++;
      status = 'Leave';
    } else {
      workingDays++;
      if (attendance?.checkIn) {
        presentDays++;
        checkIn = formatTimeIst(new Date(attendance.checkIn.timestamp));
        checkOut = attendance.checkOut
          ? formatTimeIst(new Date(attendance.checkOut.timestamp))
          : '';
        status = 'Present';

        if (scheduled?.start) {
          const [h, m] = String(scheduled.start).split(':').map(Number);
          let eh = h || 0;
          let em = (m || 0) + 10;
          if (em >= 60) {
            eh += Math.floor(em / 60);
            em %= 60;
          }
          const expectedFixed = new Date(
            `${dateKey}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00+05:30`
          );
          const actual = new Date(attendance.checkIn.timestamp);
          const diffMinutes = (actual - expectedFixed) / 60000;
          if (diffMinutes >= 60) {
            halfDays++;
            status = 'Half Day';
          } else if (diffMinutes > 0) {
            lateDays++;
            status = 'Late';
          }
        }
      } else {
        status = 'Absent';
      }
    }

    days.push({
      dateKey,
      dateLabel: formatDateLabel(dateObj),
      dayName,
      status,
      checkIn,
      checkOut,
    });
  }

  return {
    monthLabel,
    summary: {
      totalDays: daysInMonth,
      workingDays,
      presentDays,
      absentDays: Math.max(0, workingDays - presentDays),
      leaveDays,
      lateDays,
      halfDays,
      offDays,
    },
    days,
  };
};

const findPayslipForMonth = async (userId, monthLabel, year) => {
  return Payslip.findOne({
    userId,
    month: monthLabel,
  })
    .sort({ createdAt: -1 })
    .lean();
};

/** Company policy: up to 2 leave+absent days/month are paid; excess is LOP. */
const ALLOWED_LEAVE_DAYS_PER_MONTH = 2;

const annualToMonthlySalary = (annualSalary = 0) => {
  const annual = Number(annualSalary) || 0;
  return Math.round((annual / 12) * 100) / 100;
};

const calculateLopDays = (leaveDays = 0, absentDays = 0) => {
  const leave = Number(leaveDays) || 0;
  const absent = Number(absentDays) || 0;
  return Math.max(0, leave + absent - ALLOWED_LEAVE_DAYS_PER_MONTH);
};

const calculatePaidGrossPay = (monthlySalary = 0, daysInMonth = 0, lopDays = 0) => {
  const days = Number(daysInMonth) || 0;
  const monthly = Number(monthlySalary) || 0;
  if (days <= 0) return monthly;
  const paidDays = Math.max(days - (Number(lopDays) || 0), 0);
  return Math.round((monthly / days) * paidDays * 100) / 100;
};

/**
 * Build payslip payload from user profile + attendance summary.
 * Same fields as PayslipGenerator UI. PF / TDS always 0.
 * Basic Pay / net = attendance-adjusted monthly salary.
 */
const buildAutoPayslipPayload = (user, attendanceSummary, monthMeta) => {
  const {
    buildPayslipViewModel,
    getCompanyStatutoryDefaults,
    getIssueDateLabel,
  } = require('../utils/payslipViewModel');

  const summary = attendanceSummary || {};
  const annualSalary = Number(user?.salary) || 0;
  const monthlySalary = annualToMonthlySalary(annualSalary);
  const daysInMonth = Number(summary.totalDays) || Number(monthMeta?.daysInMonth) || 0;
  const leaveDays = Number(summary.leaveDays) || 0;
  const absentDays = Number(summary.absentDays) || 0;
  const lopDays = calculateLopDays(leaveDays, absentDays);
  const paidSalary = calculatePaidGrossPay(monthlySalary, daysInMonth, lopDays);
  const companyStatutory = getCompanyStatutoryDefaults(user?.company);

  const incomes = { 'Basic Pay': paidSalary };
  const deductions = { PF: 0, TDS: 0 };
  const totalIncome = paidSalary;
  const totalDeductions = 0;
  const netPay = paidSalary;

  const bank = user?.bankDetails || {};
  const employeeDetails = {
    name: user.name || '',
    designation: user.position || '',
    department: user.department || '',
    company: user.company || '',
    email: user.email || '',
    phone: user.phone || '',
    mobile: user.phone || '',
    employeeId: user.employeeId || '',
    dateOfJoining: user.dateOfJoining || null,
    pan: user.pan || '',
    uan: user.uan || '',
    esiNumber: user.esiNumber || '',
    empGrade: user.empGrade || '',
    bankAccountName: bank.bankingName || '',
    bankAccountNumber: bank.bankAccountNumber || '',
    ifsc: bank.ifscCode || '',
    tan: companyStatutory.tan,
    pfNumber: companyStatutory.pfNumber,
    esiRegNumber: companyStatutory.esiRegNumber,
    ctc: annualSalary,
    grossPay: monthlySalary,
    paidGrossPay: paidSalary,
    totalDays: daysInMonth,
    leaveDays,
    absentDays,
    lopDays,
    month: monthMeta.monthLabel,
    generatedDate: new Date(),
    // Remitted On = payslip issue / send date
    remittedOn: getIssueDateLabel(new Date()),
    workingLocation:
      user.branch || bank.officeBranch || 'Chennai',
  };

  const viewModel = buildPayslipViewModel(
    employeeDetails,
    incomes,
    deductions,
    totalIncome,
    totalDeductions
  );
  viewModel.autoGenerated = true;
  viewModel.generatedAt = new Date().toISOString();

  return {
    userId: user._id,
    employeeId: user.employeeId || '',
    employeeDetails,
    attendanceSummary: {
      totalDays: daysInMonth,
      workingDays: Number(summary.workingDays) || 0,
      presentDays: Number(summary.presentDays) || 0,
      absentDays,
      leaveDays,
      lateDays: Number(summary.lateDays) || 0,
      halfDays: Number(summary.halfDays) || 0,
      lopDays,
    },
    incomes,
    deductions,
    totalIncome,
    totalDeductions,
    netPay,
    month: monthMeta.monthLabel,
    year: monthMeta.year,
    viewModelSnapshot: viewModel,
  };
};

/**
 * Use HR-created payslip if present; otherwise auto-generate (and save unless dryRun).
 */
const ensurePayslipForMonth = async (user, attendanceSummary, monthMeta, { dryRun = false } = {}) => {
  const existing = await findPayslipForMonth(user._id, monthMeta.monthLabel, monthMeta.year);
  if (existing) {
    return { payslip: existing, autoGenerated: false };
  }

  const payload = buildAutoPayslipPayload(user, attendanceSummary, monthMeta);
  if (dryRun) {
    return { payslip: payload, autoGenerated: true };
  }

  const created = await Payslip.create(payload);
  return { payslip: created.toObject ? created.toObject() : created, autoGenerated: true };
};

const alreadySent = async (userId, monthKey) => {
  const existing = await MonthlyReportLog.findOne({
    user: userId,
    monthKey,
    status: 'sent',
  })
    .select('_id')
    .lean();
  return Boolean(existing);
};

const claimSlot = async ({ userId, email, monthKey, monthLabel, hasPayslip }) => {
  const existing = await MonthlyReportLog.findOne({ user: userId, monthKey });
  if (existing && existing.status === 'sent') return false;

  if (existing) {
    existing.email = email;
    existing.monthLabel = monthLabel;
    existing.hasPayslip = hasPayslip;
    existing.status = 'sent';
    existing.errorMessage = '';
    existing.sentAt = new Date();
    await existing.save();
    return true;
  }

  try {
    await MonthlyReportLog.create({
      user: userId,
      email,
      monthKey,
      monthLabel,
      hasPayslip,
      status: 'sent',
      sentAt: new Date(),
    });
    return true;
  } catch (err) {
    if (err && (err.code === 11000 || err.code === '11000')) return false;
    throw err;
  }
};

const markFailed = async ({ userId, monthKey, errorMessage }) => {
  await MonthlyReportLog.findOneAndUpdate(
    { user: userId, monthKey },
    {
      $set: {
        status: 'failed',
        errorMessage: String(errorMessage || '').slice(0, 500),
      },
    },
    { upsert: true }
  );
};

const sendMail = async ({ to, subject, html }) => {
  assertEmailConfigured();
  return transporter.sendMail({
    from: getSenderFromAddress(),
    to,
    subject,
    html,
  });
};

/**
 * Send monthly attendance + payslip emails for previous IST month.
 * @param {{ now?: Date, dryRun?: boolean, force?: boolean, userId?: string }} opts
 */
const runMonthlyReports = async ({
  now = new Date(),
  dryRun = false,
  force = false,
  userId = null,
} = {}) => {
  const monthMeta = getPreviousMonthMeta(now);
  const { monthKey, monthLabel, monthStart, monthEnd } = monthMeta;

  let employees = await getEligibleEmployees();
  if (userId) {
    employees = employees.filter((u) => String(u._id) === String(userId));
  }

  const fullUsers = await User.find({
    _id: { $in: employees.map((e) => e._id) },
  })
    .select(
      '_id name email position works role isActive company department employeeId dateOfJoining bankDetails salary phone pan uan esiNumber empGrade'
    )
    .lean();

  const userIds = fullUsers.map((u) => u._id);

  const [schedules, holidays, leaves, allLogs] = await Promise.all([
    Schedule.find({ user: { $in: userIds } }).lean(),
    Holiday.find({
      date: { $gte: monthStart, $lte: monthEnd },
    }).lean(),
    LeaveRequest.find({
      user: { $in: userIds },
      status: 'Approved',
      fromDate: { $lte: monthEnd },
      toDate: { $gte: monthStart },
    }).lean(),
    Attendance.find({
      user: { $in: userIds },
      timestamp: { $gte: monthStart, $lte: monthEnd },
      type: { $in: ['check-in', 'check-out'] },
    })
      .select('user type timestamp')
      .lean(),
  ]);

  const scheduleByUser = new Map(
    schedules.map((s) => [String(s.user), s.weeklySchedule || {}])
  );
  const holidayKeys = holidayDateKeys(holidays);
  const leavesByUser = new Map();
  for (const leave of leaves) {
    const id = String(leave.user);
    if (!leavesByUser.has(id)) leavesByUser.set(id, []);
    leavesByUser.get(id).push(leave);
  }
  const logsByUser = new Map();
  for (const log of allLogs) {
    if (log.user == null) continue;
    const id = String(log.user);
    if (!logsByUser.has(id)) logsByUser.set(id, []);
    logsByUser.get(id).push(log);
  }

  const results = [];

  for (const user of fullUsers) {
    const id = String(user._id);

    if (!force && (await alreadySent(user._id, monthKey))) {
      results.push({
        status: 'skipped_duplicate',
        userId: id,
        email: user.email,
        monthKey,
      });
      continue;
    }

    const attendance = buildEmployeeAttendance({
      logs: logsByUser.get(id) || [],
      weeklySchedule: scheduleByUser.get(id) || {},
      holidayKeys,
      approvedLeaves: leavesByUser.get(id) || [],
      monthMeta,
    });

    // Attendance-only digest. Payslip mails are sent separately on the 4th.
    const html = buildMonthlyReportHtml({
      name: user.name,
      monthLabel,
      attendance,
    });
    const subject = `Monthly Attendance Report — ${monthLabel}`;

    if (dryRun) {
      results.push({
        status: 'dry_run',
        userId: id,
        email: user.email,
        monthKey,
        summary: attendance.summary,
      });
      continue;
    }

    if (!force) {
      const claimed = await claimSlot({
        userId: user._id,
        email: user.email,
        monthKey,
        monthLabel,
        hasPayslip: false,
      });
      if (!claimed) {
        results.push({
          status: 'skipped_duplicate',
          userId: id,
          email: user.email,
          monthKey,
        });
        continue;
      }
    } else {
      await MonthlyReportLog.findOneAndUpdate(
        { user: user._id, monthKey },
        {
          $set: {
            email: user.email,
            monthLabel,
            hasPayslip: false,
            status: 'sent',
            errorMessage: '',
            sentAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    try {
      await sendMail({ to: user.email, subject, html });
      results.push({
        status: 'sent',
        userId: id,
        email: user.email,
        monthKey,
      });
    } catch (err) {
      await markFailed({
        userId: user._id,
        monthKey,
        errorMessage: err.message,
      });
      results.push({
        status: 'failed',
        userId: id,
        email: user.email,
        monthKey,
        error: err.message,
      });
    }
  }

  return {
    monthKey,
    monthLabel,
    candidateCount: fullUsers.length,
    results,
  };
};

module.exports = {
  TIMEZONE,
  getPreviousMonthMeta,
  buildEmployeeAttendance,
  findPayslipForMonth,
  buildAutoPayslipPayload,
  ensurePayslipForMonth,
  calculateLopDays,
  calculatePaidGrossPay,
  annualToMonthlySalary,
  runMonthlyReports,
};
