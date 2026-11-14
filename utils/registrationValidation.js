const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VALID_ACCOUNT_TYPES = ['Savings', 'Current'];

function isValidPhone(phone) {
  return typeof phone === 'string' && /^\d{10}$/.test(phone.trim());
}

function isValidBloodGroup(bloodGroup) {
  return VALID_BLOOD_GROUPS.includes(String(bloodGroup || '').trim());
}

function isValidBankAccountNumber(value) {
  return /^\d{9,18}$/.test(String(value || '').trim());
}

function isValidIfscCode(value) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(value || '').trim().toUpperCase());
}

function isValidUpiId(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(v);
}

function validateAndNormalizeBankDetails(raw) {
  let bank = raw;
  if (typeof raw === 'string') {
    try {
      bank = JSON.parse(raw);
    } catch (_) {
      return { error: 'Bank details must be valid JSON', bankDetails: null };
    }
  }
  if (!bank || typeof bank !== 'object') {
    return { error: 'Bank details are required', bankDetails: null };
  }

  const accountHolderName = String(bank.accountHolderName || '').trim();
  const bankingName = String(bank.bankingName || bank.bankName || '').trim();
  const bankAccountNumber = String(bank.bankAccountNumber || bank.accountNumber || '').trim();
  const ifscCode = String(bank.ifscCode || bank.ifsc || '').trim().toUpperCase();
  const branchName = String(bank.branchName || '').trim();
  const accountType = String(bank.accountType || '').trim();
  const upiId = String(bank.upiId || '').trim();
  const officeBranch = String(bank.officeBranch || '').trim();

  if (!accountHolderName) {
    return { error: 'Account holder name is required.', bankDetails: null };
  }
  if (!bankingName) {
    return { error: 'Bank name is required.', bankDetails: null };
  }
  if (!isValidBankAccountNumber(bankAccountNumber)) {
    return { error: 'Please enter a valid account number (9–18 digits).', bankDetails: null };
  }
  if (!isValidIfscCode(ifscCode)) {
    return { error: 'Please enter a valid IFSC code (e.g. HDFC0001234).', bankDetails: null };
  }
  if (!VALID_ACCOUNT_TYPES.includes(accountType)) {
    return { error: 'Account type must be Savings or Current.', bankDetails: null };
  }
  if (upiId && !isValidUpiId(upiId)) {
    return { error: 'Please enter a valid UPI ID (e.g. name@upi).', bankDetails: null };
  }

  return {
    error: null,
    bankDetails: {
      accountHolderName,
      bankingName,
      bankAccountNumber,
      ifscCode,
      branchName,
      accountType,
      upiId,
      officeBranch,
    },
  };
}

function parseWorkExperience(raw) {
  if (raw == null || raw === '') return [];
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
  if (!Array.isArray(list)) return null;
  return list;
}

function parseYmd(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    const d = value.getDate();
    return {
      year: y,
      month: m,
      day: d,
      iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      date: new Date(y, m - 1, d),
    };
  }
  const str = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return {
    year,
    month,
    day,
    iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    date,
  };
}

function dayIndexFromParsed(parsed) {
  if (!parsed) return null;
  return Math.floor(parsed.date.getTime() / (24 * 60 * 60 * 1000));
}

function resolveStartDate(entry) {
  if (entry.startDate) return parseYmd(entry.startDate);
  if (entry.startYear && entry.startMonth) {
    const day = entry.startDay || 1;
    return parseYmd(
      `${Number(entry.startYear)}-${String(Number(entry.startMonth)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`
    );
  }
  return null;
}

function resolveEndDate(entry) {
  if (entry.endDate) return parseYmd(entry.endDate);
  if (entry.endYear && entry.endMonth) {
    const day = entry.endDay || 1;
    return parseYmd(
      `${Number(entry.endYear)}-${String(Number(entry.endMonth)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`
    );
  }
  return null;
}

function normalizeWorkExperienceEntry(entry, index) {
  if (!entry || typeof entry !== 'object') {
    return { error: `Work experience entry ${index + 1} is invalid` };
  }

  const companyName = String(entry.companyName || '').trim();
  const jobRole = String(entry.jobRole || '').trim();
  const responsibilities = String(entry.responsibilities || '').trim();
  const reasonForLeaving = String(entry.reasonForLeaving || '').trim();
  const currentlyWorking = Boolean(entry.currentlyWorking);

  if (!companyName) {
    return { error: `Company name is required for experience entry ${index + 1}` };
  }
  if (!jobRole) {
    return { error: `Job role is required for experience entry ${index + 1}` };
  }

  const start = resolveStartDate(entry);
  if (!start) {
    return { error: `Please provide a valid from date for experience entry ${index + 1}` };
  }

  let end = null;
  if (!currentlyWorking) {
    end = resolveEndDate(entry);
    if (!end) {
      return { error: `Please provide a valid end date for experience entry ${index + 1}` };
    }
    if (end.date < start.date) {
      return { error: `End date cannot be earlier than from date for experience entry ${index + 1}` };
    }
  }

  return {
    value: {
      companyName,
      jobRole,
      startDate: start.iso,
      endDate: currentlyWorking ? null : end.iso,
      startDay: start.day,
      startMonth: start.month,
      startYear: start.year,
      endDay: currentlyWorking ? null : end.day,
      endMonth: currentlyWorking ? null : end.month,
      endYear: currentlyWorking ? null : end.year,
      currentlyWorking,
      responsibilities,
      reasonForLeaving,
    },
  };
}

function validateAndNormalizeWorkExperience(raw, { isFresher } = {}) {
  if (isFresher) {
    return { workExperience: [], error: null };
  }

  const parsed = parseWorkExperience(raw);
  if (parsed === null) {
    return { workExperience: [], error: 'Work experience must be a valid JSON array' };
  }

  const normalized = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const result = normalizeWorkExperienceEntry(parsed[i], i);
    if (result.error) {
      return { workExperience: [], error: result.error };
    }
    normalized.push(result.value);
  }

  return { workExperience: normalized, error: null };
}

/** Merge overlapping date ranges and return total years (1 decimal). */
function calculateTotalYearsFromWorkExperience(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const today = new Date();
  const todayParsed = parseYmd(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  );
  const todayIndex = dayIndexFromParsed(todayParsed);

  const ranges = entries
    .map((e) => {
      const start = resolveStartDate(e);
      if (!start) return null;
      const end = e.currentlyWorking ? todayParsed : resolveEndDate(e);
      if (!end) return null;
      const startIdx = dayIndexFromParsed(start);
      const endIdx = dayIndexFromParsed(end);
      if (startIdx == null || endIdx == null || endIdx < startIdx) return null;
      return { start: startIdx, end: endIdx };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  if (ranges.length === 0) return null;

  const merged = [{ ...ranges[0] }];
  for (let i = 1; i < ranges.length; i += 1) {
    const last = merged[merged.length - 1];
    const cur = ranges[i];
    if (cur.start <= last.end + 1) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }

  const totalDays = merged.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
  return Math.round((totalDays / 365.25) * 10) / 10;
}

function deriveLegacyExperienceFields(workExperience) {
  if (!Array.isArray(workExperience) || workExperience.length === 0) {
    return {
      previousCompany: '',
      previousJobRole: '',
      previousWorkExperience: '',
    };
  }

  const first = workExperience[0];
  const summary = workExperience
    .map((e, i) => {
      const from = e.startDate || `${e.startDay || 1}/${e.startMonth}/${e.startYear}`;
      const to = e.currentlyWorking
        ? 'Present'
        : e.endDate || `${e.endDay || 1}/${e.endMonth}/${e.endYear}`;
      return `${i + 1}. ${e.companyName} — ${e.jobRole} (${from} to ${to})`;
    })
    .join('\n');

  return {
    previousCompany: first.companyName || '',
    previousJobRole: first.jobRole || '',
    previousWorkExperience: summary,
  };
}

module.exports = {
  VALID_BLOOD_GROUPS,
  VALID_ACCOUNT_TYPES,
  isValidPhone,
  isValidBloodGroup,
  isValidBankAccountNumber,
  isValidIfscCode,
  isValidUpiId,
  validateAndNormalizeBankDetails,
  validateAndNormalizeWorkExperience,
  calculateTotalYearsFromWorkExperience,
  deriveLegacyExperienceFields,
};
