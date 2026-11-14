const mongoose = require('mongoose');

// Define BankDetails as a sub-schema
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
}, { _id: false }); // Prevents creation of an _id for this sub-doc

const WorkSchema = new mongoose.Schema({
  company: { type: String, default: '' },
  department: { type: String, default: '' },
  position: { type: String, default: '' },
  branch: { type: String, default: '' },
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

// Main User schema
const UserSchema = new mongoose.Schema({
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

  // Additional fields
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
  works: {
    type: [WorkSchema],
    default: []
  },
  qualification: {
    type: String
  },
  // Admin-maintained freeform comments about the user
  adminComments: {
    type: String,
    default: ''
  },
  dateOfJoining: {
    type: Date
  },
  // Date when the user was relieved/left the company. If absent => currently working
  dateOfRelieving: {
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
  bankDetails: BankDetailsSchema
  ,
  pan: { type: String, default: '' },
  uan: { type: String, default: '' },
  esiNumber: { type: String, default: '' },
  empGrade: { type: String, default: '' },
  aadharNumber: { type: String, default: '' },
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
  // Sequential employee identifier (e.g. UC0001, JZ0001)
  employeeId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  // Stored letter copies uploaded for this user (PDFs)
  letterCopies: {
    type: [
      {
        url: { type: String },
        filename: { type: String },
        // Name shown on the letter (may differ from the User.name)
        candidateName: { type: String, default: '' },
        // Human letter title, e.g. "Offer Letter"
        letterName: { type: String, default: '' },
        // Generator key: offer | experience | relieving | internship-offer | internship | uploaded
        letterType: { type: String, default: '' },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now },
        // Offer workflow versioning
        version: { type: Number, default: 1 },
        outdated: { type: Boolean, default: false },
      }
    ],
    default: []
  },

  // Experience fields (from registration / offer onboarding)
  isFresher: { type: Boolean, default: false },
  workExperience: { type: [WorkExperienceSchema], default: [] },
  previousCompany: { type: String, default: '' },
  previousWorkExperience: { type: String, default: '' },
  previousJobRole: { type: String, default: '' },
  totalYearsOfExperience: { type: Number, default: null },

  // Full-Time | Part-Time — drives schedule expectations & offer letter defaults
  employmentType: {
    type: String,
    enum: ['Full-Time', 'Part-Time', ''],
    default: 'Full-Time',
  },

  // Link back to PendingUser while awaiting offer acceptance
  pendingRegistrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PendingUser',
    default: null,
    index: true
  },

  // Pending Activation | Active | Inactive (mirrors isActive for admin UI)
  activationStatus: {
    type: String,
    enum: ['Pending Activation', 'Active', 'Inactive'],
    default: 'Active',
  },

  // Offer letter onboarding workflow (admin-managed)
  offerLetter: {
    status: {
      type: String,
      enum: ['Not Generated', 'Generated', 'Sent', 'Accepted', 'Declined', 'Expired'],
      default: 'Not Generated',
    },
    details: {
      candidateName: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      addressLine1: { type: String, default: '' },
      addressLine2: { type: String, default: '' },
      designation: { type: String, default: '' },
      department: { type: String, default: '' },
      company: { type: String, default: '' },
      salary: { type: String, default: '' },
      joiningDate: { type: String, default: '' },
      offerDate: { type: String, default: '' },
      probationPeriod: { type: String, default: '' },
      noticePeriod: { type: String, default: '' },
      workingHours: { type: String, default: '' },
      workLocation: { type: String, default: '' },
      workLocationBranch: { type: String, default: '' },
      reportingManager: { type: String, default: '' },
      employmentType: { type: String, default: '' },
      letterTemplate: { type: String, default: 'Standard' },
    },
    detailsSnapshot: { type: String, default: '' },
    pdfUrl: { type: String, default: '' },
    pdfFilename: { type: String, default: '' },
    pdfVersion: { type: Number, default: 0 },
    generatedAt: { type: Date, default: null },
    pdfOutdated: { type: Boolean, default: false },
    sentAt: { type: Date, default: null },
    lastEmailError: { type: String, default: '' },
    acceptanceTokenHash: { type: String, default: '', select: false },
    tokenExpiresAt: { type: Date, default: null },
    tokenUsedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    preparedAt: { type: Date, default: null },
    preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },

  // Profile-completion grace / attendance lock (backend-only; no countdown shown to users)
  profileIncompleteSince: {
    type: Date,
    default: null,
  },
  attendanceLocked: {
    type: Boolean,
    default: false,
    index: true,
  },
  attendanceLockedAt: {
    type: Date,
    default: null,
  },

  // Missed check-in + check-out + leave. Only an admin can clear this.
  inoutBlocked: {
    type: Boolean,
    default: false,
    index: true,
  },
  inoutBlockedAt: {
    type: Date,
    default: null,
  },
  inoutBlockedForDate: {
    type: String,
    default: null,
  },
  // Admin unlock for this IST date so the same missed day is not locked again.
  inoutLockWaivedForDate: {
    type: String,
    default: null,
  },
  // Shown once on the employee's next login after an admin unlock.
  inoutUnlockNoticePending: {
    type: Boolean,
    default: false,
  },

  // If true, skip 10 AM / 6 PM / 8 PM attendance reminder emails
  skipAttendanceReminders: {
    type: Boolean,
    default: false,
    index: true,
  },

}, {
  timestamps: true
});

// Generate sequential employeeId if not present using a Counter collection.
// Format: <PREFIX><4-digit seq>, e.g. UC0001, JZ0001
UserSchema.pre('save', async function (next) {
  try {
    if (this.employeeId) return next();

    // decide prefix based on company
    const company = (this.company || '').toLowerCase();
    let prefix = 'UC';
    if (company.includes('urbancode')) prefix = 'UC';
    else if (company.includes('jobzenter')) prefix = 'JZ';
    else {
      // fallback: first two letters of company or UC
      const letters = (this.company || 'UC').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
      prefix = letters.length === 2 ? letters : 'UC';
    }

    const Counter = require('./Counter');
    const counter = await Counter.findOneAndUpdate(
      { _id: prefix },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    ).exec();

    const seq = counter.seq || 1;
    const padded = String(seq).padStart(4, '0');
    this.employeeId = `${prefix}${padded}`;

    return next();
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model('User', UserSchema);
