const axios = require('axios');
const { getIstDateKey } = require('../utils/missedAttendanceLock');

const DEFAULT_URL =
  'https://api.seyal.urbancode.in/api/integrations/inout/attendance';

const LEAVE_TYPE_TO_STATUS = {
  Casual: 'casual_leave',
  Sick: 'sick_leave',
  Emergency: 'leave',
};

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

const isEnabled = () => {
  if (process.env.SEYAL_INOUT_ENABLED === 'false') return false;
  if (process.env.SEYAL_INOUT_ENABLED === 'true') return true;
  // Key alone is not enough — wait for explicit enable (live switch).
  return false;
};

const getConfig = () => {
  const key = String(process.env.SEYAL_INOUT_KEY || '').trim();
  const url = String(process.env.SEYAL_INOUT_URL || DEFAULT_URL).trim();
  return { key, url };
};

/** YYYY-MM-DD in Asia/Kolkata for a Date / ISO string. */
const toDateKey = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return getIstDateKey(d);
};

const mapLeaveStatus = (leaveType) =>
  LEAVE_TYPE_TO_STATUS[leaveType] || 'leave';

const truncateReason = (reason) => {
  const text = String(reason || '').trim();
  if (!text) return undefined;
  return text.length > 200 ? text.slice(0, 200) : text;
};

const buildBody = (input) => {
  const records = Array.isArray(input) ? input : [input];
  const cleaned = records
    .map((r) => {
      if (!r || !r.email || !r.status) return null;
      const row = {
        email: String(r.email).trim().toLowerCase(),
        status: String(r.status).trim(),
      };
      if (r.from && r.to) {
        row.from = r.from;
        row.to = r.to;
      } else if (r.date) {
        row.date = r.date;
      } else {
        return null;
      }
      if (r.reason) row.reason = truncateReason(r.reason);
      return row;
    })
    .filter(Boolean);

  if (!cleaned.length) return null;
  return cleaned.length === 1 ? cleaned[0] : { records: cleaned };
};

/**
 * Single POST to Seyal. Safe no-op when disabled or key missing.
 */
const pushAttendanceToSeyal = async (input) => {
  if (!isEnabled()) {
    return { skipped: true, reason: 'disabled' };
  }

  const { key, url } = getConfig();
  if (!key) {
    console.warn('[Seyal] SEYAL_INOUT_KEY not set — skip push');
    return { skipped: true, reason: 'no_key' };
  }

  const body = buildBody(input);
  if (!body) {
    return { skipped: true, reason: 'empty' };
  }

  try {
    const res = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-InOut-Key': key,
      },
      timeout: 15_000,
      validateStatus: () => true,
    });

    if (res.status === 200) {
      const data = res.data || {};
      if (Array.isArray(data.unmatched) && data.unmatched.length) {
        console.warn('[Seyal] unmatched emails:', data.unmatched);
      }
      if (Array.isArray(data.invalid) && data.invalid.length) {
        console.warn('[Seyal] invalid records:', data.invalid);
      }
      return { ok: true, status: 200, data };
    }

    console.error(`[Seyal] push failed ${res.status}:`, res.data);
    return {
      ok: false,
      status: res.status,
      data: res.data,
      retryable: res.status >= 500 || res.status === 503,
    };
  } catch (err) {
    console.error('[Seyal] push error:', err.message);
    return { ok: false, reason: err.message, retryable: true };
  }
};

const scheduleRetry = (input, attemptIndex) => {
  if (attemptIndex >= RETRY_DELAYS_MS.length) {
    console.error('[Seyal] retries exhausted');
    return;
  }
  const delay = RETRY_DELAYS_MS[attemptIndex];
  setTimeout(() => {
    pushAttendanceToSeyal(input)
      .then((result) => {
        if (result.ok || result.skipped) return;
        if (result.status === 400 || result.status === 401) return;
        if (result.retryable) scheduleRetry(input, attemptIndex + 1);
      })
      .catch((err) => {
        console.error('[Seyal] retry error:', err.message);
        scheduleRetry(input, attemptIndex + 1);
      });
  }, delay);
};

/** Fire-and-forget with back-off retries (1m / 5m / 15m) on 5xx / network. */
const pushAttendanceToSeyalSafe = (input) => {
  Promise.resolve()
    .then(() => pushAttendanceToSeyal(input))
    .then((result) => {
      if (result.ok || result.skipped) return;
      if (result.status === 400 || result.status === 401) return;
      if (result.retryable) scheduleRetry(input, 0);
    })
    .catch((err) => console.error('[Seyal] unexpected error:', err.message));
};

const notifyLeaveApproved = ({ email, fromDate, toDate, leaveType, reason }) => {
  const from = toDateKey(fromDate);
  const to = toDateKey(toDate);
  if (!email || !from || !to) return;
  pushAttendanceToSeyalSafe({
    email,
    from,
    to,
    status: mapLeaveStatus(leaveType),
    reason: reason || leaveType || undefined,
  });
};

/** Clears In Out leave/absent mark on Seyal (reject / delete / cancel). */
const notifyLeaveCleared = ({ email, fromDate, toDate }) => {
  const from = toDateKey(fromDate);
  const to = toDateKey(toDate);
  if (!email || !from || !to) return;
  pushAttendanceToSeyalSafe({
    email,
    from,
    to,
    status: 'present',
  });
};

/** Check-in → present for today (clears prior leave/absent if any). */
const notifyCheckInPresent = ({ email, date = new Date() }) => {
  const dateKey = toDateKey(date);
  if (!email || !dateKey) return;
  pushAttendanceToSeyalSafe({
    email,
    date: dateKey,
    status: 'present',
  });
};

module.exports = {
  isEnabled,
  toDateKey,
  mapLeaveStatus,
  pushAttendanceToSeyal,
  pushAttendanceToSeyalSafe,
  notifyLeaveApproved,
  notifyLeaveCleared,
  notifyCheckInPresent,
  DEFAULT_URL,
};
