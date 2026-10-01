const mongoose = require('mongoose');

// Define BankDetails as a sub-schema
const BankDetailsSchema = new mongoose.Schema({
  bankingName: {
    type: String
  },
  bankAccountNumber: {
    type: String
  },
  ifscCode: {
    type: String
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
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now }
      }
    ],
    default: []
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
