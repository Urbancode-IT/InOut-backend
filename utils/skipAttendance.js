const normalizeLabel = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const collectLabels = (user, field) => {
  const values = [user?.[field]];
  if (Array.isArray(user?.works)) {
    for (const work of user.works) {
      if (work?.[field]) values.push(work[field]);
    }
  }
  return values.map(normalizeLabel).filter(Boolean);
};

const isFreelancerLabel = (label) =>
  label === 'freelancer' || label.includes('freelancer');

const isManagementDepartment = (label) =>
  label === 'management' || label === 'managment';

const isPlacementLead = (label) =>
  label === 'placement lead' || label.includes('placement lead');

const isDirectorOrFounderTitle = (title) => {
  if (title === 'director') return true;
  if (title.includes('managing director')) return true;
  if (title.includes('founder')) return true;
  return false;
};

/**
 * Who skips check-in / check-out:
 * - Freelancer department or position
 * - Director / Founder roles
 * - Management department — except Placement Lead (they must check in / out)
 */
const skipsCheckInOut = (user) => {
  if (!user) return false;
  const departments = collectLabels(user, 'department');
  const positions = collectLabels(user, 'position');

  if (departments.some(isFreelancerLabel) || positions.some(isFreelancerLabel)) {
    return true;
  }

  if (positions.some(isDirectorOrFounderTitle)) {
    return true;
  }

  // Placement Lead in Management still needs attendance
  if (positions.some(isPlacementLead)) {
    return false;
  }

  if (departments.some(isManagementDepartment)) {
    return true;
  }

  return false;
};

const isDirectorOrFounder = (user) => {
  const titles = collectLabels(user, 'position');
  return titles.some(isDirectorOrFounderTitle);
};

/** Reminder emails: skip for anyone who does not use check-in / check-out. */
const skipsAttendanceReminders = (user) => skipsCheckInOut(user);

const skipsAttendanceReports = (user) =>
  skipsCheckInOut(user) || isDirectorOrFounder(user);

module.exports = {
  skipsCheckInOut,
  isDirectorOrFounder,
  skipsAttendanceReminders,
  skipsAttendanceReports,
};
