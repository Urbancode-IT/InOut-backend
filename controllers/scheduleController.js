const Schedule = require('../models/Schedule');
const User = require('../models/User');

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const defaultDay = (isLeave = false) => ({
  start: '09:00',
  end: '17:00',
  isLeave,
});

const defaultWeeklySchedule = () =>
  DAYS.reduce((acc, day) => {
    acc[day] = defaultDay(day === 'Sunday');
    return acc;
  }, {});

const scheduleController = {
  getAllSchedules: async (req, res) => {
    try {
      // isActive: { $ne: false } keeps older employees who have no isActive field
      // (strict isActive:true was why only some people like Subhiksha appeared)
      const [employees, schedules] = await Promise.all([
        User.find({ role: 'employee', isActive: { $ne: false } })
          .select('name email role company position isActive employeeId employmentType')
          .sort({ name: 1 })
          .lean(),
        Schedule.find().lean(),
      ]);

      const scheduleByUser = new Map(
        schedules.map((s) => [String(s.user), s])
      );

      const merged = employees.map((user) => {
        const employmentType =
          user.employmentType === 'Part-Time' ? 'Part-Time' : 'Full-Time';
        const existing = scheduleByUser.get(String(user._id));
        if (existing) {
          return {
            ...existing,
            employmentType:
              existing.employmentType === 'Part-Time' || existing.employmentType === 'Full-Time'
                ? existing.employmentType
                : employmentType,
            user,
          };
        }

        // No schedule row yet — show employee with defaults.
        // _id is the user id so Save can upsert via updateUserSchedule.
        return {
          _id: user._id,
          user,
          weeklySchedule: defaultWeeklySchedule(),
          employmentType,
          salary: user.salary || 0,
          isNewSchedule: true,
        };
      });

      res.json(merged);
    } catch (error) {
      console.error('Error fetching schedules:', error);
      res.status(500).json({ error: 'Failed to fetch schedules' });
    }
  },

  updateUserSchedule: async (req, res) => {
    try {
      const { id } = req.params;
      const weeklySchedule = req.body.weeklySchedule;
      const salary = req.body.salary;
      const employmentTypeRaw = req.body.employmentType;
      const userIdHint = req.body.user || req.body.userId;

      const payload = {};
      if (weeklySchedule !== undefined) payload.weeklySchedule = weeklySchedule;
      if (salary !== undefined) payload.salary = salary;
      let normalizedEmploymentType;
      if (employmentTypeRaw !== undefined) {
        normalizedEmploymentType =
          String(employmentTypeRaw).trim() === 'Part-Time' ? 'Part-Time' : 'Full-Time';
        payload.employmentType = normalizedEmploymentType;
      }

      const populateUser = {
        path: 'user',
        select: 'name email role company position isActive employeeId employmentType',
      };

      let updated = await Schedule.findByIdAndUpdate(id, payload, {
        new: true,
      }).populate(populateUser);

      // Id may be a user id (employee with no schedule doc yet)
      if (!updated) {
        const userId = userIdHint || id;
        updated = await Schedule.findOneAndUpdate(
          { user: userId },
          { $set: { ...payload, user: userId } },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        ).populate(populateUser);
      }

      // Keep User.employmentType in sync so attendance/admin UIs stay consistent
      if (normalizedEmploymentType && updated?.user) {
        const userId = updated.user._id || updated.user;
        await User.findByIdAndUpdate(userId, {
          $set: { employmentType: normalizedEmploymentType },
        });
        if (updated.user && typeof updated.user === 'object') {
          updated.user.employmentType = normalizedEmploymentType;
        }
      }

      res.json(updated);
    } catch (error) {
      console.error('Error updating schedule:', error);
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  },
};

module.exports = scheduleController;
