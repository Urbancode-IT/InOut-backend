/** Real leave types that count toward monthly quota and leave reports. */
const PERSONAL_LEAVE_TYPES = ['Casual', 'Sick', 'Emergency'];

/** Office attendance without punch — unlocks lock, counts as Present (not Leave). */
const FORGOT_PUNCH_LEAVE_TYPE = 'Forgot Check-In/Out';

const ALL_LEAVE_TYPES = [...PERSONAL_LEAVE_TYPES, FORGOT_PUNCH_LEAVE_TYPE];

const MONTHLY_LEAVE_LIMITS = { Casual: 1, Sick: 1, Emergency: 1 };

const isPersonalLeaveType = (leaveType) => PERSONAL_LEAVE_TYPES.includes(leaveType);

const isForgotPunchLeaveType = (leaveType) => leaveType === FORGOT_PUNCH_LEAVE_TYPE;

const isAllowedLeaveType = (leaveType) => ALL_LEAVE_TYPES.includes(leaveType);

module.exports = {
  PERSONAL_LEAVE_TYPES,
  FORGOT_PUNCH_LEAVE_TYPE,
  ALL_LEAVE_TYPES,
  MONTHLY_LEAVE_LIMITS,
  isPersonalLeaveType,
  isForgotPunchLeaveType,
  isAllowedLeaveType,
};
