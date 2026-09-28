const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const officeLocation = require('../config/officeLocation');
const {
  parseLocationCoords,
  branchToOfficeName,
  matchOfficeWithPairing,
  enrichAttendanceLogs,
  getAttendanceTimestamp,
} = require('../utils/officeMatch');
const {
  userIdFilters,
  joinAttendanceToEmployees,
  serializeAttendanceRows,
  parseDateRange,
  fetchAttendanceInRange,
} = require('../utils/attendanceQuery');
const { applyProfileGateOnCheckIn } = require('../utils/profileCompletion');
const { validateMarkAttendance } = require('../utils/attendanceGuard');
const {
  INOUT_BLOCKED_MESSAGE,
  ensureUserMissedDayLock,
} = require('../services/missedAttendanceLockService');
const { saveAttendanceImageInBackground, uploadAttendanceImageNow } = require('../middleware/upload');

const resolveAttendanceUserIds = async (userId) => {
  const user = await User.findById(userId).select('email employeeId phone name');
  if (!user) return [String(userId)];

  const orUsers = [{ _id: user._id }];
  if (user.email) orUsers.push({ email: user.email });
  if (user.employeeId) orUsers.push({ employeeId: user.employeeId });
  if (user.phone) orUsers.push({ phone: user.phone });

  const related = await User.find({ $or: orUsers }).select('_id employeeId');
  const ids = new Set(related.map((u) => String(u._id)));
  ids.add(String(userId));
  return [...ids];
};

const addRows = (map, rows) => {
  for (const row of rows || []) {
    map.set(String(row._id), row);
  }
};

const formatUserRef = (user) => {
  if (user == null) return null;
  if (user instanceof mongoose.Types.ObjectId) return String(user);
  if (typeof user === 'string') return user;
  if (typeof user === 'object') {
    return {
      _id: user._id ? String(user._id) : undefined,
      name: user.name,
      email: user.email,
    };
  }
  return String(user);
};

const findAttendanceForUser = async (userId) => {
  const primary = await User.findById(userId).select('employeeId email phone name');
  const userIds = await resolveAttendanceUserIds(userId);
  const filters = [];

  for (const id of userIds) {
    filters.push(...userIdFilters(id));
  }

  const unique = new Map();

  if (filters.length) {
    // Do not populate — legacy rows store employeeId strings in `user`, which breaks populate.
    const rows = await Attendance.find({ $or: filters })
      .sort({ timestamp: -1, _id: -1 })
      .lean();
    addRows(unique, rows);
  }

  if (primary?.employeeId) {
    try {
      const legacy = await Attendance.find({
        $expr: { $eq: [{ $toString: '$user' }, String(primary.employeeId)] },
      })
        .sort({ timestamp: -1, _id: -1 })
        .lean();
      addRows(unique, legacy);
    } catch (legacyErr) {
      console.error('Legacy attendance $expr lookup failed:', legacyErr.message);
    }
  }

  return [...unique.values()].sort((a, b) => {
    const ta = getAttendanceTimestamp(a)?.getTime() || 0;
    const tb = getAttendanceTimestamp(b)?.getTime() || 0;
    return tb - ta;
  });
};

const serializeAttendanceList = (records) => {
  try {
    return enrichAttendanceLogs(records).map((row) => {
      const ts = getAttendanceTimestamp(row);
      return {
        _id: row._id ? String(row._id) : row._id,
        type: String(row.type || '').trim(),
        location: row.location || '',
        isInOffice: row.isInOffice,
        officeName: row.officeName || 'Outside Office',
        image: row.image || '',
        comment: row.comment || '',
        user: formatUserRef(row.user),
        timestamp: ts ? ts.toISOString() : null,
      };
    });
  } catch (err) {
    console.error('serializeAttendanceList failed:', err.message);
    return (records || []).map((row) => {
      const ts = getAttendanceTimestamp(row);
      return {
        _id: row._id ? String(row._id) : row._id,
        type: String(row.type || '').trim(),
        location: row.location || '',
        isInOffice: row.isInOffice,
        officeName: row.officeName || 'Outside Office',
        image: row.image || '',
        comment: row.comment || '',
        user: formatUserRef(row.user),
        timestamp: ts ? ts.toISOString() : null,
      };
    });
  }
};

exports.markAttendance = async (req, res) => {
  try {
    const attendanceType = String(req.body.type || '').trim();

    if (!req.body.location || !req.body.location.includes(',')) {
      return res.status(400).json({ error: 'Invalid location format' });
    }

    if (!['check-in', 'check-out'].includes(attendanceType)) {
      return res.status(400).json({ error: 'Invalid attendance type' });
    }

    const coords = parseLocationCoords(req.body.location);
    if (!coords) {
      return res.status(400).json({ error: 'Invalid location format' });
    }

    const profileSelect =
      'branch address bankDetails bloodGroup dateOfBirth dateOfJoining dateOfRelieving role position works isActive skills rolesAndResponsibility company profileIncompleteSince attendanceLocked attendanceLockedAt inoutBlocked inoutBlockedAt inoutBlockedForDate inoutLockWaivedForDate employeeId email';
    const user = await User.findById(req.user._id).select(profileSelect);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await ensureUserMissedDayLock(user);
    if (user.inoutBlocked) {
      return res.status(403).json({
        error: 'In-Out locked',
        code: 'INOUT_BLOCKED',
        message: INOUT_BLOCKED_MESSAGE,
        inoutBlocked: true,
        inoutBlockedForDate: user.inoutBlockedForDate,
      });
    }

    let profileGate = {
      locked: Boolean(user.attendanceLocked),
      profileIncomplete: false,
      missingFields: [],
      justLocked: false,
    };

    // Profile gate + 3-day lock apply to check-in only (backend is source of truth).
    // Always evaluate completeness first so a later-completed profile auto-unlocks.
    if (attendanceType === 'check-in') {
      profileGate = await applyProfileGateOnCheckIn(user);

      if (profileGate.locked) {
        return res.status(403).json({
          error: 'Attendance locked',
          code: 'ATTENDANCE_LOCKED',
          message:
            'Your attendance has been locked because your profile is incomplete. Complete the missing fields or contact an admin to unlock.',
          missingFields: profileGate.missingFields,
        });
      }
    }

    const duplicateGuard = await validateMarkAttendance(req.user._id, attendanceType);
    if (!duplicateGuard.ok) {
      return res.status(duplicateGuard.status).json({
        error: duplicateGuard.message,
        code: duplicateGuard.code,
        message: duplicateGuard.message,
      });
    }

    const preferredOfficeName = branchToOfficeName(user);

    let pairedCheckIn = null;
    if (attendanceType === 'check-out') {
      try {
        const dateKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        const todayStart = new Date(`${dateKey}T00:00:00+05:30`);
        pairedCheckIn = await Attendance.findOne({
          user: req.user._id,
          type: 'check-in',
          timestamp: { $gte: todayStart },
        }).sort({ timestamp: -1 });
      } catch (pairErr) {
        console.error('Checkout pairing lookup failed:', pairErr.message);
      }
    }

    const match = matchOfficeWithPairing(coords.lat, coords.lon, officeLocation, {
      preferredOfficeName,
      pairedCheckIn,
    });

    const isInOffice = match.isInOffice;
    const matchedOfficeName = match.isInOffice ? match.officeName : null;

    let imageUrl = '';
    if (req.file?.buffer) {
      imageUrl = await uploadAttendanceImageNow(req.file.buffer);
    }

    const attendance = new Attendance({
      user: req.user._id,
      type: attendanceType,
      location: req.body.location,
      comment: req.body.comment || '',
      image: imageUrl,
      isInOffice,
      officeName: matchedOfficeName || 'Outside Office',
      timestamp: new Date(),
    });

    await attendance.save();

    try {
      require('./adminController').invalidateAttendanceCaches();
    } catch (cacheErr) {
      console.error('Attendance cache clear failed:', cacheErr.message);
    }

    if (req.file?.buffer && !imageUrl) {
      saveAttendanceImageInBackground(attendance._id, req.file.buffer);
    }

    const response = {
      message: 'Attendance marked',
      isInOffice,
      office: matchedOfficeName,
      type: attendance.type,
      timestamp: attendance.timestamp,
    };

    if (attendanceType === 'check-in' && profileGate.profileIncomplete) {
      response.profileIncomplete = true;
      response.profileWarning =
        'Your profile information is incomplete. Please complete your profile.';
      response.missingFields = profileGate.missingFields;
    }

    res.json(response);
  } catch (err) {
    console.error('Mark attendance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAllAttendance = async (req, res) => {
  try {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 3);
    start.setHours(0, 0, 0, 0);

    const records = await Attendance.find({ timestamp: { $gte: start } })
      .sort({ timestamp: -1, _id: -1 })
      .limit(8000)
      .lean();

    let enriched = [];
    try {
      const joined = await joinAttendanceToEmployees(records);
      try {
        enriched = serializeAttendanceRows(joined);
      } catch (serErr) {
        console.error('getAllAttendance serialize failed:', serErr.message);
        enriched = joined.map((row) => ({
          ...row,
          timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
        }));
      }
    } catch (joinErr) {
      console.error('getAllAttendance join failed:', joinErr.message);
      enriched = records.map((row) => ({
        employeeName: 'Unknown',
        userId: row.user ? String(row.user) : null,
        type: row.type,
        timestamp: row.timestamp,
        location: row.location,
        isInOffice: row.isInOffice,
        officeName: row.officeName || 'Outside Office',
        image: row.image || '',
      }));
    }

    res.json(enriched);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getLastAttendance = async (req, res) => {
  try {
    const lastRecord = await Attendance.findOne({ $or: userIdFilters(req.user._id) })
      .sort({ timestamp: -1, _id: -1 })
      .select('type timestamp');

    if (!lastRecord) {
      return res.status(200).json({ type: null, timestamp: null });
    }

    res.json({
      type: lastRecord.type,
      timestamp: lastRecord.timestamp,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch last attendance' });
  }
};

exports.getUserSummary = async (req, res) => {
  const { userId, year, month } = req.params;
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  try {
    const allDays = new Set();

    const records = await Attendance.find({
      $or: userIdFilters(userId),
      timestamp: { $gte: startDate, $lte: endDate },
      type: 'check-in',
    });

    records.forEach((r) => {
      const ts = getAttendanceTimestamp(r);
      if (ts) allDays.add(ts.toISOString().split('T')[0]);
    });

    const totalDays = endDate.getDate();

    res.json({
      present: allDays.size,
      absent: totalDays - allDays.size,
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance summary' });
  }
};

exports.getUserLastAttendance = async (req, res) => {
  try {
    const lastRecord = await Attendance.findOne({
      $or: userIdFilters(req.params.userId),
    })
      .sort({ timestamp: -1, _id: -1 })
      .select('type timestamp');

    res.json(lastRecord || { type: 'None', timestamp: null });
  } catch (err) {
    console.error('Last user attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch last record' });
  }
};

exports.getAttendanceByUser = async (req, res) => {
  try {
    const records = await findAttendanceForUser(req.params.userId);
    res.json(serializeAttendanceList(records));
  } catch (error) {
    console.error('Error fetching attendance records by user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getMyAttendance = async (req, res) => {
  try {
    const records = await findAttendanceForUser(req.user._id);
    res.json(serializeAttendanceList(records));
  } catch (error) {
    console.error('Error fetching my attendance:', error);

    try {
      const filters = userIdFilters(req.user._id);
      const fallback = await Attendance.find(
        filters.length ? { $or: filters } : {}
      )
        .sort({ timestamp: -1, _id: -1 })
        .limit(2000)
        .lean();

      res.json(serializeAttendanceList(fallback));
    } catch (fallbackErr) {
      console.error('getMyAttendance fallback failed:', fallbackErr);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

exports.getAttendanceByDate = async (req, res) => {
  try {
    const range = parseDateRange(req.params.date);

    if (!range) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
    }

    const records = await fetchAttendanceInRange(range.start, range.end);
    const joined = await joinAttendanceToEmployees(records);

    res.json(serializeAttendanceRows(joined));
  } catch (error) {
    console.error('Error fetching attendance by date:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};