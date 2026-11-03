const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** @deprecated use ONE_DAY_MS — kept for older imports */
const THREE_DAYS_MS = ONE_DAY_MS;

const isFilled = (value) => {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.some((item) => {
      if (item == null) return false;
      if (typeof item === 'string') return item.trim().length > 0;
      return true;
    });
  }
  return true;
};

const firstFilled = (...values) => {
  for (const value of values) {
    if (isFilled(value)) return value;
  }
  return undefined;
};

const REQUIRED_PROFILE_CHECKS = [
  { key: 'address', get: (u) => firstFilled(u.address, u.residentialAddress) },
  { key: 'bloodGroup', get: (u) => firstFilled(u.bloodGroup, u.blood_group) },
  { key: 'dateOfBirth', get: (u) => firstFilled(u.dateOfBirth, u.dob, u.birthDate) },
  {
    key: 'bankDetails.bankingName',
    get: (u) =>
      firstFilled(
        u.bankDetails?.bankingName,
        u.bankDetails?.bankName,
        u.bankDetails?.accountHolderName
      ),
  },
  {
    key: 'bankDetails.bankAccountNumber',
    get: (u) =>
      firstFilled(
        u.bankDetails?.bankAccountNumber,
        u.bankDetails?.accountNumber
      ),
  },
  {
    key: 'bankDetails.ifscCode',
    get: (u) => firstFilled(u.bankDetails?.ifscCode, u.bankDetails?.ifsc),
  },
  {
    key: 'aadharCard',
    get: (u) =>
      firstFilled(
        typeof u.aadharCard === 'string' ? u.aadharCard : null,
        u.aadharCard?.url,
        u.aadharCard?.secure_url
      ),
  },
];

const getProfileIncompleteGraceMs = () => {
  const raw = process.env.PROFILE_INCOMPLETE_GRACE_MS;
  if (raw != null && raw !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return ONE_DAY_MS;
};

const getMissingProfileFields = (user) =>
  REQUIRED_PROFILE_CHECKS.filter(({ get }) => !isFilled(get(user))).map(({ key }) => key);

const isProfileComplete = (user) => getMissingProfileFields(user).length === 0;

const hasIncompleteGraceExpired = (profileIncompleteSince, now = new Date()) => {
  if (!profileIncompleteSince) return false;
  const started = new Date(profileIncompleteSince).getTime();
  if (Number.isNaN(started)) return false;
  return now.getTime() - started >= getProfileIncompleteGraceMs();
};

const needsCompletionReset = (user) =>
  Boolean(user?.attendanceLocked || user?.profileIncompleteSince || user?.attendanceLockedAt);

const resetCompletionTracking = (user) => {
  user.profileIncompleteSince = null;
  user.attendanceLocked = false;
  user.attendanceLockedAt = null;
};

/**
 * If required profile fields are filled, clear grace tracking and auto-unlock.
 * Locked users who later complete their profile should be able to check in again.
 */
const unlockIfProfileComplete = async (user) => {
  if (!user || !isProfileComplete(user) || !needsCompletionReset(user)) return user;
  resetCompletionTracking(user);
  await user.save();
  return user;
};

/**
 * Persist incomplete-profile tracking / auto-lock for check-in.
 * Mutates and saves the user document when state changes.
 *
 * @returns {{
 *   locked: boolean,
 *   profileIncomplete: boolean,
 *   missingFields: string[],
 *   justLocked: boolean,
 * }}
 */
const applyProfileGateOnCheckIn = async (user, now = new Date()) => {
  const missingFields = getMissingProfileFields(user);
  const profileIncomplete = missingFields.length > 0;

  if (!profileIncomplete) {
    if (needsCompletionReset(user)) {
      resetCompletionTracking(user);
      await user.save();
    }
    return {
      locked: false,
      profileIncomplete: false,
      missingFields: [],
      justLocked: false,
    };
  }

  if (user.attendanceLocked) {
    return {
      locked: true,
      profileIncomplete: true,
      missingFields,
      justLocked: false,
    };
  }

  if (!user.profileIncompleteSince) {
    user.profileIncompleteSince = now;
    await user.save();
    return {
      locked: false,
      profileIncomplete: true,
      missingFields,
      justLocked: false,
    };
  }

  if (hasIncompleteGraceExpired(user.profileIncompleteSince, now)) {
    user.attendanceLocked = true;
    user.attendanceLockedAt = now;
    await user.save();
    return {
      locked: true,
      profileIncomplete: true,
      missingFields,
      justLocked: true,
    };
  }

  return {
    locked: false,
    profileIncomplete: true,
    missingFields,
    justLocked: false,
  };
};

/** Clear grace tracking / lock when profile becomes complete. */
const clearIncompleteTrackingIfComplete = async (user) => unlockIfProfileComplete(user);

module.exports = {
  ONE_DAY_MS,
  THREE_DAYS_MS,
  REQUIRED_PROFILE_CHECKS,
  getMissingProfileFields,
  isProfileComplete,
  hasIncompleteGraceExpired,
  getProfileIncompleteGraceMs,
  applyProfileGateOnCheckIn,
  clearIncompleteTrackingIfComplete,
  unlockIfProfileComplete,
};
