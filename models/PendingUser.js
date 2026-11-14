const mongoose = require('mongoose');

const BankDetailsSchema = new mongoose.Schema({
  accountHolderName: {
    type: String,
    default: ''
  },
  bankingName: {
    type: String
  },
  bankAccountNumber: {
    type: String
  },
  ifscCode: {
    type: String
  },
  branchName: {
    type: String,
    default: ''
  },
  accountType: {
    type: String,
    enum: ['', 'Savings', 'Current'],
    default: ''
  },
  upiId: {
    type: String
  },
  officeBranch: {
    type: String
  }
}, { _id: false });

const WorkExperienceSchema = new mongoose.Schema({
  companyName: { type: String, default: '' },
  jobRole: { type: String, default: '' },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: null },
  startDay: { type: Number, default: null },
  startMonth: { type: Number, default: null },
  startYear: { type: Number, default: null },
  endDay: { type: Number, default: null },
  endMonth: { type: Number, default: null },
  endYear: { type: Number, default: null },
  currentlyWorking: { type: Boolean, default: false },
  responsibilities: { type: String, default: '' },
  reasonForLeaving: { type: String, default: '' },
}, { _id: false });

// Day schedule sub-schema (keeps shape consistent with Schedule model)
const DaySchedule = new mongoose.Schema({
  start: { type: String, default: '09:00' },
  end: { type: String, default: '17:00' },
  isLeave: { type: Boolean, default: false }
}, { _id: false });

const PendingUserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  bloodGroup: {
    type: String
  },
  address: {
    type: String
  },
  position: {
    type: String,
    required: true
  },
  company: {
    type: String,
    required: true
  },
  salary: {
    type: Number,
    default: 0
  },
  role: {
    type: String,
    enum: ['employee', 'admin', 'other'],
    default: 'employee'
  },

  profilePic: {
    type: String
  },
  dateOfBirth: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  department: {
    type: String
  },
  branch: {
    type: String,
    default: ''
  },
  qualification: {
    type: String
  },
  dateOfJoining: {
    type: Date
  },
  rolesAndResponsibility: {
    type: [String],
    default: []
  },
  skills: {
    type: [String],
    default: []
  },
  aadharNumber: {
    type: String,
    default: ''
  },
  aadharCard: {
    url: { type: String, default: '' },
    filename: { type: String, default: '' },
    uploadedAt: { type: Date }
  },
  resume: {
    url: { type: String, default: '' },
    filename: { type: String, default: '' },
    uploadedAt: { type: Date }
  },
  employmentType: {
    type: String,
    enum: ['Full-Time', 'Part-Time'],
    default: 'Full-Time',
  },
  schedule: {
    Monday: DaySchedule,
    Tuesday: DaySchedule,
    Wednesday: DaySchedule,
    Thursday: DaySchedule,
    Friday: DaySchedule,
    Saturday: DaySchedule,
    Sunday: DaySchedule
  },
  bankDetails: BankDetailsSchema,

  // Experience fields (registration)
  isFresher: { type: Boolean, default: false },
  workExperience: { type: [WorkExperienceSchema], default: [] },
  previousCompany: { type: String, default: '' },
  previousWorkExperience: { type: String, default: '' },
  previousJobRole: { type: String, default: '' },
  totalYearsOfExperience: { type: Number, default: null },

  // Registration review workflow
  registrationStatus: {
    type: String,
    enum: ['Pending Review', 'Approved', 'Rejected'],
    default: 'Pending Review',
    index: true
  },
  // Inactive User created for offer letter / All Letters (activated only after accept)
  linkedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  rejectedAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },

}, {
  timestamps: true
});

module.exports = mongoose.model('PendingUser', PendingUserSchema);
