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

/**
 * Management department and Freelancer staff do not use check-in / check-out.
 */
const skipsCheckInOut = (user) => {
  if (!user) return false;
  const departments = collectLabels(user, 'department');
  const positions = collectLabels(user, 'position');

  if (departments.some((d) => isManagementDepartment(d) || isFreelancerLabel(d))) {
    return true;
  }
  if (positions.some(isFreelancerLabel)) return true;
  return false;
};

const isDirectorOrFounder = (user) => {
  const titles = collectLabels(user, 'position');
  return titles.some((title) => {
    if (title === 'director') return true;
    if (title.includes('managing director')) return true;
    if (title.includes('founder')) return true;
    return false;
  });
};

/** Reminder emails: Directors + Management + Freelancer. */
const skipsAttendanceReminders = (user) =>
  skipsCheckInOut(user) ||
  collectLabels(user, 'position').some((title) => title === 'director');

const skipsAttendanceReports = (user) =>
  skipsCheckInOut(user) || isDirectorOrFounder(user);

module.exports = {
  skipsCheckInOut,
  isDirectorOrFounder,
  skipsAttendanceReminders,
  skipsAttendanceReports,
};
