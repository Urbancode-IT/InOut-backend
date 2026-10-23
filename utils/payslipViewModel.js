const { rupeesInWords } = require('./numberToWords');

const DEFAULT_COMPANY_NAME = 'Urbancode Edutech Solutions Pvt Ltd';
const ALLOWED_LEAVE_DAYS_PER_MONTH = 2;

const COMPANY_INFO = {
  'urbancode edutech solutions pvt ltd': {
    cin: 'U46512TN2025PTC175901',
    gstin: '33AADCU7262Q1ZR',
    address: '9/29, 5th Street Kamakoti Nagar, Pallikaranai, Chennai - 600100',
    email: 'admin@urbancode.in',
    website: 'urbancode.in',
    phone: '98787 98797',
    tan: '',
    pfNumber: '',
    esiRegNumber: '',
  },
  'jobzenter placement solutions': {
    cin: '',
    gstin: '',
    address: '',
    email: '',
    website: '',
    phone: '',
    tan: '',
    pfNumber: '',
    esiRegNumber: '',
  },
};

const calculateLopDays = (leaveDays = 0, absentDays = 0) => {
  const leave = Number(leaveDays) || 0;
  const absent = Number(absentDays) || 0;
  return Math.max(0, leave + absent - ALLOWED_LEAVE_DAYS_PER_MONTH);
};

const annualToMonthlySalary = (annualSalary = 0) => {
  const annual = Number(annualSalary) || 0;
  return Math.round((annual / 12) * 100) / 100;
};

const calculatePaidGrossPay = (monthlySalary = 0, daysInMonth = 0, lopDays = 0) => {
  const days = Number(daysInMonth) || 0;
  const monthly = Number(monthlySalary) || 0;
  if (days <= 0) return monthly;
  const paidDays = Math.max(days - (Number(lopDays) || 0), 0);
  return Math.round((monthly / days) * paidDays * 100) / 100;
};

const getCompanyStatutoryDefaults = (company = '') => {
  const key = String(company || '').trim().toLowerCase();
  if (key.includes('jobzenter')) {
    const info = COMPANY_INFO['jobzenter placement solutions'] || {};
    return {
      tan: info.tan || '',
      pfNumber: info.pfNumber || '',
      esiRegNumber: info.esiRegNumber || '',
    };
  }
  const urbancode = COMPANY_INFO['urbancode edutech solutions pvt ltd'] || {};
  return {
    tan: urbancode.tan || '',
    pfNumber: urbancode.pfNumber || '',
    esiRegNumber: urbancode.esiRegNumber || '',
  };
};

const normalizeItems = (items) => {
  if (!items) return [];
  if (items instanceof Map) {
    return Array.from(items.entries()).map(([label, amount]) => ({
      label,
      amount: Number(amount || 0),
    }));
  }
  if (Array.isArray(items)) {
    return items
      .filter((i) => i && i.label)
      .map((i) => ({ label: i.label, amount: Number(i.amount || 0) }));
  }
  if (typeof items === 'object') {
    return Object.entries(items).map(([label, amount]) => ({
      label,
      amount: Number(amount || 0),
    }));
  }
  return [];
};

const formatDateLabel = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const text = String(value).trim();
    return text;
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(d)
    .replace(/ /g, '-');
};

/** Payslip issue / send date for Remitted On (IST). */
const getIssueDateLabel = (now = new Date()) => formatDateLabel(now);

const payPeriodLabel = (monthLabel) => {
  // "October 2026" → 01-OCT-2026 to 31-OCT-2026
  const match = String(monthLabel || '').match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return '';
  const monthName = match[1];
  const year = Number(match[2]);
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
  if (Number.isNaN(monthIndex)) return '';
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  const fmt = (d) => {
    const mon = d
      .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
      .toUpperCase();
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${day}-${mon}-${d.getUTCFullYear()}`;
  };
  return `${fmt(start)} to ${fmt(end)}`;
};

/**
 * Same view-model shape as frontend PayslipTemplate / PayslipGenerator.
 */
const buildPayslipViewModel = (
  employeeDetails = {},
  incomes = [],
  deductions = [],
  totalIncome = 0,
  totalDeductions = 0
) => {
  const earnings = normalizeItems(incomes);
  const deds = normalizeItems(deductions);

  const companyName =
    String(employeeDetails.company || '').toLowerCase() === 'jobzenter'
      ? 'Jobzenter Placement Solutions'
      : DEFAULT_COMPANY_NAME;

  const companyInfo = COMPANY_INFO[companyName.toLowerCase()] || COMPANY_INFO['urbancode edutech solutions pvt ltd'];

  const daysInMonth = Number(employeeDetails.totalDays || 0);
  const lopDays =
    employeeDetails.lopDays !== '' &&
    employeeDetails.lopDays !== undefined &&
    employeeDetails.lopDays !== null
      ? Number(employeeDetails.lopDays) || 0
      : calculateLopDays(employeeDetails.leaveDays, employeeDetails.absentDays);
  const paidDays = Math.max(daysInMonth - lopDays, 0);

  const calculatedGrossPay = Number(totalIncome || 0);
  const calculatedPaidGrossPay = calculatePaidGrossPay(
    calculatedGrossPay,
    daysInMonth,
    lopDays
  );

  const grossPay =
    employeeDetails.grossPay !== '' && employeeDetails.grossPay !== undefined
      ? Number(employeeDetails.grossPay)
      : calculatedGrossPay;

  const paidGrossPay =
    employeeDetails.paidGrossPay !== '' &&
    employeeDetails.paidGrossPay !== undefined
      ? Number(employeeDetails.paidGrossPay)
      : calculatedPaidGrossPay;

  const monthLabel = employeeDetails.month || '';
  const netPayNum =
    Math.round((Number(paidGrossPay) - Number(totalDeductions || 0)) * 100) / 100;

  const companyStatutory = getCompanyStatutoryDefaults(employeeDetails.company);

  return {
    companyName,
    cin: companyInfo.cin || '',
    gstin: companyInfo.gstin || '',
    address: companyInfo.address || '',
    email: companyInfo.email || '',
    website: companyInfo.website || '',
    phone: companyInfo.phone || '',

    tan: employeeDetails.tan || companyStatutory.tan || '',
    pfNumber: employeeDetails.pfNumber || companyStatutory.pfNumber || '',
    esiRegNumber:
      employeeDetails.esiRegNumber || companyStatutory.esiRegNumber || '',
    mobile: employeeDetails.mobile || employeeDetails.phone || '',

    payPeriodLabel: payPeriodLabel(monthLabel),
    monthLabel,

    payslipReference:
      employeeDetails.payslipReference ||
      (employeeDetails.employeeId
        ? `PS-${employeeDetails.employeeId}-${monthLabel.replace(/\s+/g, '')}`
        : ''),
    generatedOn: employeeDetails.generatedDate
      ? formatDateLabel(employeeDetails.generatedDate)
      : formatDateLabel(new Date()),

    name: employeeDetails.name || '',
    empId: employeeDetails.employeeId || '',
    empGrade: employeeDetails.empGrade || '',

    pan: employeeDetails.pan || '',
    uan: employeeDetails.uan || '',
    esi: employeeDetails.esiNumber || '',

    bankName: employeeDetails.bankAccountName || '',
    bankAccNo: employeeDetails.bankAccountNumber || '',
    ifsc: employeeDetails.ifsc || '',

    daysInMonth,
    lopDays,
    paidDays,

    ctc: employeeDetails.ctc || '',
    grossPay: Number(grossPay || 0).toFixed(2),
    paidGrossPay: Number(paidGrossPay || 0).toFixed(2),

    department: employeeDetails.department || '',
    designation: employeeDetails.designation || '',

    joiningDate: employeeDetails.dateOfJoining
      ? formatDateLabel(employeeDetails.dateOfJoining)
      : '',
    workingLocation: employeeDetails.workingLocation || 'Chennai',

    earnings,
    deductions: deds,
    totalEarnings: Number(totalIncome || 0),
    totalDeductions: Number(totalDeductions || 0),
    netPay: netPayNum,
    netPayWords: rupeesInWords(netPayNum),
    remittedOn: employeeDetails.remittedOn
      ? formatDateLabel(employeeDetails.remittedOn)
      : '',
  };
};

/**
 * Build view-model from a saved/auto Payslip document.
 */
const viewModelFromPayslip = (payslip) => {
  if (!payslip) return null;
  if (payslip.viewModelSnapshot && payslip.viewModelSnapshot.companyName) {
    return payslip.viewModelSnapshot;
  }

  const emp = { ...(payslip.employeeDetails || {}) };
  const summary = payslip.attendanceSummary || {};
  if (emp.totalDays == null) emp.totalDays = summary.totalDays;
  if (emp.leaveDays == null) emp.leaveDays = summary.leaveDays;
  if (emp.absentDays == null) emp.absentDays = summary.absentDays;
  if (emp.lopDays == null) emp.lopDays = summary.lopDays;
  if (!emp.month) emp.month = payslip.month || '';

  return buildPayslipViewModel(
    emp,
    payslip.incomes,
    payslip.deductions,
    payslip.totalIncome,
    payslip.totalDeductions
  );
};

/** Empty / missing values → "-" for payslip display. */
const displayDash = (value) => {
  if (value === 0 || value === '0') return '0';
  if (value === null || value === undefined) return '-';
  const text = String(value).trim();
  return text === '' ? '-' : text;
};

module.exports = {
  ALLOWED_LEAVE_DAYS_PER_MONTH,
  DEFAULT_COMPANY_NAME,
  COMPANY_INFO,
  calculateLopDays,
  annualToMonthlySalary,
  calculatePaidGrossPay,
  getCompanyStatutoryDefaults,
  buildPayslipViewModel,
  viewModelFromPayslip,
  payPeriodLabel,
  displayDash,
  formatDateLabel,
  getIssueDateLabel,
};
