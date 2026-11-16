// -----------------------------
// 📁 controllers/authController.js
// -----------------------------
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PendingUser = require('../models/PendingUser');
const transporter = require('../config/emailConfig');
const { uploadRegisterFile } = require('../utils/registerFileUpload');
const {
  isValidPhone,
  isValidBloodGroup,
  validateAndNormalizeBankDetails,
  validateAndNormalizeWorkExperience,
  calculateTotalYearsFromWorkExperience,
  deriveLegacyExperienceFields,
} = require('../utils/registrationValidation');

function parseMaybeJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function parseMaybeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  // FormData may send comma-separated or JSON array string
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    const parsed = parseMaybeJson(trimmed, null);
    if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeAadhar(value) {
  return String(value || '').replace(/\D/g, '');
}

function isEmailTakenByUser(user) {
  if (!user) return false;
  if (user.isActive !== false) return true;
  if (user.offerLetter?.status === 'Accepted') return true;
  // Inactive offer-in-progress still blocks re-register with same email
  return true;
}

async function findAvailabilityConflicts({ email, phone, aadharNumber }) {
  const conflicts = {};

  if (email) {
    const emailNorm = normalizeEmail(email);
    const [existingUser, existingPending] = await Promise.all([
      User.findOne({ email: emailNorm }).select('_id isActive offerLetter'),
      PendingUser.findOne({ email: emailNorm }).select('_id'),
    ]);
    if (existingPending || isEmailTakenByUser(existingUser)) {
      conflicts.email = 'This email ID already exists. Please use a different email.';
    }
  }

  if (phone) {
    const phoneNorm = normalizePhone(phone);
    if (phoneNorm.length === 10) {
      const [existingUser, existingPending] = await Promise.all([
        User.findOne({ phone: phoneNorm }).select('_id'),
        PendingUser.findOne({ phone: phoneNorm }).select('_id'),
      ]);
      if (existingUser || existingPending) {
        conflicts.phone = 'This mobile number already exists. Please use a different number.';
      }
    }
  }

  if (aadharNumber) {
    const aadharNorm = normalizeAadhar(aadharNumber);
    if (aadharNorm.length === 12) {
      const aadharRegex = new RegExp(`^\\D*${aadharNorm.split('').join('\\D*')}\\D*$`);
      const [existingUser, existingPending] = await Promise.all([
        User.findOne({ aadharNumber: aadharRegex }).select('_id aadharNumber'),
        PendingUser.findOne({ aadharNumber: aadharRegex }).select('_id aadharNumber'),
      ]);
      const userMatch =
        existingUser && normalizeAadhar(existingUser.aadharNumber) === aadharNorm;
      const pendingMatch =
        existingPending && normalizeAadhar(existingPending.aadharNumber) === aadharNorm;
      if (userMatch || pendingMatch) {
        conflicts.aadharNumber =
          'This Aadhaar number already exists. Please check and try again.';
      }
    }
  }

  return conflicts;
}

function formatTotalExperience(years, isFresher) {
  if (years == null || years === '' || Number.isNaN(Number(years))) {
    return isFresher ? '0 years' : 'N/A';
  }
  const amount = Number(years);
  return `${amount} ${amount === 1 ? 'year' : 'years'}`;
}

const authController = {
  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Only active users can log in (treat missing isActive as active, matching rest of app)
      if (user.isActive === false) {
        return res.status(403).json({ error: 'Account is inactive. Please contact admin.' });
      }

      const token = jwt.sign(
        {
          userId: user._id,
          role: user.role,
          name: user.name
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        token,
        userId: user._id,
        role: user.role,
        name: user.name,
        inoutUnlockNotice: user.inoutUnlockNoticePending === true,
      });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  checkAvailability: async (req, res) => {
    try {
      const email = req.query.email || req.body?.email;
      const phone = req.query.phone || req.body?.phone;
      const aadharNumber = req.query.aadharNumber || req.body?.aadharNumber;

      if (!email && !phone && !aadharNumber) {
        return res.status(400).json({
          error: 'Provide at least one of email, phone, or aadharNumber.',
        });
      }

      const conflicts = await findAvailabilityConflicts({ email, phone, aadharNumber });
      return res.json({
        available: Object.keys(conflicts).length === 0,
        conflicts,
      });
    } catch (error) {
      console.error('checkAvailability error:', error);
      return res.status(500).json({ error: 'Failed to check availability' });
    }
  },

  register: async (req, res) => {
    try {
      // Multipart without multer leaves req.body undefined — never destructure raw.
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const {
        name,
        email,
        password,
        phone,
        position,
        company,
        salary,
        department,
        qualification,
        dateOfJoining,
        dateOfBirth,
        rolesAndResponsibility,
        skills,
        profilePic: profilePicUrl,
        bloodGroup,
        address,
        branch,
        aadharNumber,
        bankDetails,
        schedule,
        employmentType,
        previousCompany,
        previousWorkExperience,
        previousJobRole,
        totalYearsOfExperience,
        workExperience,
        isFresher,
      } = body;

      // Validate required fields
      if (!name || !email || !password || !phone || !position || !company) {
        return res.status(400).json({ error: 'All required fields must be filled' });
      }

      // Salary is set by admin only after registration (defaults to 0)
      if (!department || !String(department).trim()) {
        return res.status(400).json({ error: 'Department is required.' });
      }
      if (!qualification || !String(qualification).trim()) {
        return res.status(400).json({ error: 'Qualification is required.' });
      }
      if (!dateOfJoining) {
        return res.status(400).json({ error: 'Date of joining is required.' });
      }
      if (!rolesAndResponsibility || !String(rolesAndResponsibility).trim()) {
        return res.status(400).json({ error: 'Roles & responsibilities are required.' });
      }
      if (!skills || !String(skills).trim()) {
        return res.status(400).json({ error: 'Skills are required.' });
      }

      if (!isValidPhone(String(phone))) {
        return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      }

      if (!isValidBloodGroup(bloodGroup)) {
        return res.status(400).json({ error: 'Please select your blood group.' });
      }

      const fresherFlag =
        isFresher === true ||
        isFresher === 'true' ||
        isFresher === '1' ||
        String(isFresher || '').toLowerCase() === 'fresher';

      const { workExperience: normalizedWorkExperience, error: workExpError } =
        validateAndNormalizeWorkExperience(workExperience, { isFresher: fresherFlag });
      if (workExpError) {
        return res.status(400).json({ error: workExpError });
      }

      const bankWithOffice = typeof bankDetails === 'string'
        ? (() => { try { return JSON.parse(bankDetails); } catch (_) { return bankDetails; } })()
        : bankDetails;
      const bankPayload =
        bankWithOffice && typeof bankWithOffice === 'object'
          ? { ...bankWithOffice, officeBranch: bankWithOffice.officeBranch || branch || '' }
          : bankDetails;
      const { bankDetails: normalizedBankDetails, error: bankError } =
        validateAndNormalizeBankDetails(bankPayload);
      if (bankError) {
        return res.status(400).json({ error: bankError });
      }

      const calculatedYears = fresherFlag
        ? 0
        : calculateTotalYearsFromWorkExperience(normalizedWorkExperience);

      let yearsRaw =
        totalYearsOfExperience === undefined || totalYearsOfExperience === null || totalYearsOfExperience === ''
          ? calculatedYears
          : Number(totalYearsOfExperience);
      if (fresherFlag) yearsRaw = 0;
      if (yearsRaw != null && (Number.isNaN(yearsRaw) || yearsRaw < 0 || yearsRaw > 60)) {
        return res.status(400).json({ error: 'Total Years of Experience must be a number between 0 and 60' });
      }

      const legacyFromWork = deriveLegacyExperienceFields(normalizedWorkExperience);
      const legacyPreviousCompany = fresherFlag
        ? ''
        : (previousCompany || legacyFromWork.previousCompany || '');
      const legacyPreviousJobRole = fresherFlag
        ? ''
        : (previousJobRole || legacyFromWork.previousJobRole || '');
      const legacyPreviousWorkExperience = fresherFlag
        ? ''
        : (previousWorkExperience || legacyFromWork.previousWorkExperience || '');

      // Check duplicates — email, mobile, Aadhaar (User + PendingUser)
      const conflicts = await findAvailabilityConflicts({
        email,
        phone,
        aadharNumber,
      });
      if (conflicts.email) {
        return res.status(400).json({ error: conflicts.email });
      }
      if (conflicts.phone) {
        return res.status(400).json({ error: conflicts.phone });
      }
      if (conflicts.aadharNumber) {
        return res.status(400).json({ error: conflicts.aadharNumber });
      }

      const profileFile = req.files?.profilePic?.[0];
      const resumeFile = req.files?.resume?.[0];
      const aadharFile = req.files?.aadharCard?.[0];

      if (!profileFile) {
        return res.status(400).json({ error: 'Profile picture is required' });
      }
      if (!resumeFile) {
        return res.status(400).json({ error: 'Resume (PDF) is required' });
      }
      if (!aadharFile) {
        return res.status(400).json({ error: 'Aadhaar card document is required' });
      }

      const emailKey = String(email).toLowerCase().replace(/[^a-z0-9]/g, '_');

      const [profileUpload, resumeUpload, aadharUpload] = await Promise.all([
        uploadRegisterFile(profileFile, {
          folder: `registrations/${emailKey}/profile`,
          publicIdPrefix: 'profile',
          resourceType: 'image',
        }),
        uploadRegisterFile(resumeFile, {
          folder: `registrations/${emailKey}/resume`,
          publicIdPrefix: 'resume',
          resourceType: 'raw',
        }),
        uploadRegisterFile(aadharFile, {
          folder: `registrations/${emailKey}/aadhar`,
          publicIdPrefix: 'aadhar',
        }),
      ]);

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      const parsedSchedule = parseMaybeJson(schedule, undefined);
      const normalizedEmploymentType =
        String(employmentType || '').trim() === 'Part-Time' ? 'Part-Time' : 'Full-Time';

      // Create pending user — NOT an active employee (cannot log in until offer acceptance)
      const pending = new PendingUser({
        name,
        email,
        password: hashedPassword,
        phone,
        position,
        company,
        salary: salary ? Number(salary) : 0,
        department: department || branch || '',
        branch: branch || '',
        qualification,
        dateOfJoining: dateOfJoining || undefined,
        dateOfBirth: dateOfBirth || undefined,
        rolesAndResponsibility: parseMaybeList(rolesAndResponsibility),
        skills: parseMaybeList(skills),
        profilePic: profileUpload?.url || profilePicUrl || '',
        bloodGroup: String(bloodGroup).trim(),
        address,
        aadharNumber: aadharNumber || '',
        aadharCard: aadharUpload || undefined,
        resume: resumeUpload || undefined,
        bankDetails: normalizedBankDetails,
        employmentType: normalizedEmploymentType,
        schedule: parsedSchedule,
        isFresher: fresherFlag,
        workExperience: normalizedWorkExperience,
        previousCompany: legacyPreviousCompany,
        previousWorkExperience: legacyPreviousWorkExperience,
        previousJobRole: legacyPreviousJobRole,
        totalYearsOfExperience: yearsRaw,
        registrationStatus: 'Pending Review',
      });

      await pending.save();

      const portalBase = (
        process.env.FRONTEND_URL ||
        process.env.CLIENT_URL ||
        'https://inout.urbancode.tech'
      ).replace(/\/$/, '');
      const reviewLink = `${portalBase}/pending-users`;
      const letterLink = `${portalBase}/letter-generator`;

      const employeeName = pending.name || 'N/A';
      const emailAddress = pending.email || 'N/A';
      const mobileNumber = pending.phone || 'N/A';
      const bloodGroupLabel = pending.bloodGroup || 'N/A';
      const companyRole =
        [pending.position, pending.company].filter((part) => String(part || '').trim()).join(' - ') || 'N/A';
      const experienceType = pending.isFresher ? 'Fresher' : 'Experienced';
      const previousCompanyLabel = pending.previousCompany || 'N/A';
      const workHistoryEntries = (pending.workExperience || []).length;
      const totalExperience = formatTotalExperience(pending.totalYearsOfExperience, pending.isFresher);

      const detailRows = [
        ['Employee Name', employeeName],
        ['Email Address', emailAddress],
        ['Mobile Number', mobileNumber],
        ['Blood Group', bloodGroupLabel],
        ['Company Role', companyRole],
        ['Experience Type', experienceType],
        ['Previous Company', previousCompanyLabel],
        ['Work History Entries', String(workHistoryEntries)],
        ['Total Work Experience', totalExperience],
      ];

      const text = `Dear HR Team,

A new employee registration has been successfully submitted through the InOut Employee Registration Portal.

The submitted registration is currently marked as Pending Review and requires your attention.

Employee Registration Details

- Employee Name: ${employeeName}
- Email Address: ${emailAddress}
- Mobile Number: ${mobileNumber}
- Blood Group: ${bloodGroupLabel}
- Company Role: ${companyRole}
- Experience Type: ${experienceType}
- Previous Company: ${previousCompanyLabel}
- Work History Entries: ${workHistoryEntries}
- Total Work Experience: ${totalExperience}

Submitted Documents:
- Profile Picture
- Resume
- Aadhaar Card

Required Action

Please review the submitted employee information and attached documents through the InOut Admin Panel:
${reviewLink}

Once the registration details have been verified, proceed with the Offer Letter generation through the existing Letter Generator:
${letterLink}

Registration Status: Pending Review

Please ensure that all submitted information is verified before proceeding with the next stage of the onboarding process.

Best Regards,
HR Management System
InOut – Urbancode

This is an automated notification from the InOut Employee Management System. Please do not reply to this email.`;

      const detailsHtml = detailRows
        .map(([label, value], index) => {
          const border = index === detailRows.length - 1 ? 'none' : '1px solid #e5e7eb';
          return `
            <tr>
              <td style="padding:10px 14px;border-bottom:${border};width:42%;font-size:13px;font-weight:700;color:#374151;vertical-align:top;">${escapeHtml(label)}</td>
              <td style="padding:10px 14px;border-bottom:${border};font-size:14px;color:#111827;vertical-align:top;">${escapeHtml(value)}</td>
            </tr>`;
        })
        .join('');

      // Email Notification (existing admin notify channel)
      const mailOptions = {
        from: process.env.NOTIFY_EMAIL || process.env.SENDER_EMAIL || 'noreply@inout.local',
        to: [
          process.env.NOTIFY_EMAIL,
          'admin@urbancode.in',
          'wepenit2020@gmail.com',
          'jayaprathap.rajan27@gmail.com',
        ].filter((addr) => String(addr || '').trim()),
        subject: `New Registration Received for InOut – ${employeeName}`,
        text,
        html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>New Registration Received for InOut</title>
        </head>
        <body style="margin:0;padding:0;background:#f4f6fb;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
                  <tr>
                    <td style="background:#1d4ed8;padding:22px 28px;">
                      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#dbeafe;font-weight:700;">InOut – Urbancode</div>
                      <div style="font-size:22px;line-height:1.35;color:#ffffff;font-weight:700;margin-top:6px;">New Registration Received</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:28px 28px 8px;">
                      <p style="margin:0 0 14px;font-size:15px;line-height:1.65;">Dear HR Team,</p>
                      <p style="margin:0 0 14px;font-size:15px;line-height:1.65;">A new employee registration has been successfully submitted through the InOut Employee Registration Portal.</p>
                      <p style="margin:0 0 22px;font-size:15px;line-height:1.65;">The submitted registration is currently marked as <strong>Pending Review</strong> and requires your attention.</p>

                      <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#0b2d67;">Employee Registration Details</p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;overflow:hidden;margin:0 0 22px;">
                        ${detailsHtml}
                      </table>

                      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#0b2d67;">Submitted Documents</p>
                      <ul style="margin:0 0 22px;padding-left:20px;font-size:15px;line-height:1.7;color:#111827;">
                        <li>Profile Picture</li>
                        <li>Resume</li>
                        <li>Aadhaar Card</li>
                      </ul>

                      <div style="background:#eef2ff;border-left:4px solid #1d4ed8;padding:16px 18px;border-radius:0 8px 8px 0;margin:0 0 22px;">
                        <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1d4ed8;">Required Action</p>
                        <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#374151;">Please review the submitted employee information and attached documents through the InOut Admin Panel.</p>
                        <p style="margin:0 0 16px;">
                          <a href="${reviewLink}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:6px;display:inline-block;font-weight:700;font-size:14px;">Open Admin Pending Approvals</a>
                        </p>
                        <p style="margin:0 0 10px;font-size:14px;line-height:1.65;color:#374151;">Once the registration details have been verified, proceed with the Offer Letter generation through the existing Letter Generator.</p>
                        <p style="margin:0;">
                          <a href="${letterLink}" style="color:#1d4ed8;font-weight:700;font-size:14px;">Open Letter Generator</a>
                        </p>
                      </div>

                      <p style="margin:0 0 14px;font-size:15px;line-height:1.65;"><strong>Registration Status:</strong> Pending Review</p>
                      <p style="margin:0 0 22px;font-size:15px;line-height:1.65;">Please ensure that all submitted information is verified before proceeding with the next stage of the onboarding process.</p>
                      <p style="margin:0 0 8px;font-size:15px;line-height:1.65;">Best Regards,<br/><strong>HR Management System</strong><br/><strong>InOut – Urbancode</strong></p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e5e7eb;">
                      <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;font-style:italic;">This is an automated notification from the InOut Employee Management System. Please do not reply to this email.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
      };

      // Never block registration on email failures
      try {
        if (transporter?.isEmailConfigured?.()) {
          transporter.sendMail(mailOptions).catch((mailErr) => {
            console.error('Registration notify email failed:', mailErr?.message || mailErr);
          });
        } else if (String(process.env.LOCAL_EMAIL_LOG || '').toLowerCase() === 'true') {
          console.log('\n========== LOCAL REGISTRATION ALERT EMAIL (not sent) ==========');
          console.log('To:', Array.isArray(mailOptions.to) ? mailOptions.to.join(', ') : mailOptions.to);
          console.log('Subject:', mailOptions.subject);
          console.log('Preview:', `New registration from ${pending.name} <${pending.email}>`);
          console.log('================================================================\n');
        } else {
          console.warn('Registration saved but email is not configured — skipping notify');
        }
      } catch (mailErr) {
        console.error('Registration notify email failed:', mailErr?.message || mailErr);
      }

      res.status(201).json({
        message: 'Registration submitted and pending admin approval',
        registrationStatus: 'Pending Review',
      });

    } catch (error) {
      console.error('Registration error:', error);
      if (error?.name === 'ValidationError') {
        const first = Object.values(error.errors || {})[0];
        return res.status(400).json({
          error: first?.message || 'Invalid registration data',
        });
      }
      if (error?.code === 11000) {
        return res.status(400).json({ error: 'Email already in use or pending approval' });
      }
      if (error?.name === 'CastError') {
        return res.status(400).json({
          error: `Invalid value for ${error.path || 'field'}. Please check bank details and schedule.`,
        });
      }
      res.status(500).json({
        error: error?.message ? `Registration failed: ${error.message}` : 'Internal server error',
      });
    }
  },

};

module.exports = authController;
