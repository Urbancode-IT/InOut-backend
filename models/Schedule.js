//server/models/Schedule.js
const mongoose = require('mongoose');

const DaySchedule = new mongoose.Schema({
  start: { type: String, default: '09:00' },
  end: { type: String, default: '17:00' },
  isLeave: { type: Boolean, default: false }
});

const ScheduleSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
    unique: true
  },
  weeklySchedule: {
    Monday: DaySchedule,
    Tuesday: DaySchedule,
    Wednesday: DaySchedule,
    Thursday: DaySchedule,
    Friday: DaySchedule,
    Saturday: DaySchedule,
    Sunday: DaySchedule
  },
  employmentType: {
    type: String,
    enum: ['Full-Time', 'Part-Time', ''],
    default: 'Full-Time',
  },
  salary: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Schedule', ScheduleSchema);