const crypto = require('crypto');
const User = require('../models/User');
const PendingUser = require('../models/PendingUser');
const Schedule = require('../models/Schedule');

const getFrontendBase = () =>
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  'https://inout.urbancode.tech';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function snapshotOfferDetails(details = {}) {
  const keys = [
    'candidateName',
    'email',
    'phone',
    'addressLine1',
    'addressLine2',
    'designation',
    'department',
    'company',
    'salary',
    'joiningDate',
    'offerDate',
    'probationPeriod',
    'noticePeriod',
    'workingHours',
    'workLocation',
    'workLocationBranch',
    'reportingManager',
    'employmentType',
    'letterTemplate',
  ];
  const normalized = {};
  keys.forEach((k) => {
    normalized[k] = details[k] == null ? '' : String(details[k]).trim();
  });
  return JSON.stringify(normalized);
}

function copyPendingToUserFields(pending) {
  return {
    name: pending.name,
    email: pending.email,
    password: pending.password,
    phone: pending.phone,
    position: pending.position,
    company: pending.company,
    role: 'employee',
    salary: pending.salary || 0,
    department: pending.department || '',
    branch: pending.branch || '',
    qualification: pending.qualification || '',
    dateOfJoining: pending.dateOfJoining,
    dateOfBirth: pending.dateOfBirth,
    rolesAndResponsibility: pending.rolesAndResponsibility || [],
    skills: pending.skills || [],
    profilePic: pending.profilePic || '',
    bloodGroup: pending.bloodGroup || '',
    address: pending.address || '',
    aadharNumber: pending.aadharNumber || '',
    aadharCard: pending.aadharCard?.url ? pending.aadharCard : undefined,
    resume: pending.resume?.url ? pending.resume : undefined,
    bankDetails: pending.bankDetails,
    previousCompany: pending.previousCompany || '',
    previousWorkExperience: pending.previousWorkExperience || '',
    previousJobRole: pending.previousJobRole || '',
    totalYearsOfExperience:
      pending.totalYearsOfExperience == null
        ? null
        : Number(pending.totalYearsOfExperience),
    isFresher: pending.isFresher === true,
    workExperience: Array.isArray(pending.workExperience) ? pending.workExperience : [],
    employmentType: pending.employmentType === 'Part-Time' ? 'Part-Time' : 'Full-Time',
  };
}

/**
 * Create (or reuse) an inactive User for offer letter generation / All Letters.
 * Does NOT activate login. Keeps PendingUser until offer acceptance or reject.
 */
async function prepareOfferFromPending(pendingId, adminUserId) {
  const pending = await PendingUser.findById(pendingId);
  if (!pending) {
    const err = new Error('Pending registration not found');
    err.status = 404;
    throw err;
  }
  if (pending.registrationStatus === 'Rejected') {
    const err = new Error('This registration was rejected');
    err.status = 400;
    throw err;
  }
  if (pending.registrationStatus === 'Approved') {
    const err = new Error('This registration is already approved');
    err.status = 400;
    throw err;
  }

  let user = null;
  if (pending.linkedUserId) {
    user = await User.findById(pending.linkedUserId);
  }
  if (!user) {
    user = await User.findOne({ email: pending.email });
  }

  if (user && user.isActive !== false && user.offerLetter?.status === 'Accepted') {
    const err = new Error('An active employee already exists for this email');
    err.status = 409;
    throw err;
  }

  if (!user) {
    const fields = copyPendingToUserFields(pending);
    user = new User({
      ...fields,
      isActive: false,
      activationStatus: 'Pending Activation',
      pendingRegistrationId: pending._id,
      offerLetter: {
        status: 'Not Generated',
        preparedAt: new Date(),
        preparedBy: adminUserId || null,
        details: {
          candidateName: pending.name || '',
          email: pending.email || '',
          phone: pending.phone || '',
          addressLine1: pending.address || '',
          addressLine2: '',
          designation: pending.position || '',
          department: pending.department || '',
          company: pending.company || '',
          salary: pending.salary != null ? String(pending.salary) : '',
          joiningDate: pending.dateOfJoining
            ? new Date(pending.dateOfJoining).toISOString().slice(0, 10)
            : '',
          offerDate: new Date().toISOString().slice(0, 10),
          employmentType: pending.employmentType === 'Part-Time' ? 'Part-Time' : 'Full-Time',
          letterTemplate: 'Standard',
        },
      },
    });
    await user.save();

    if (pending.schedule) {
      const existingSchedule = await Schedule.findOne({ user: user._id });
      if (!existingSchedule) {
        await new Schedule({
          user: user._id,
          weeklySchedule: pending.schedule,
          employmentType: pending.employmentType === 'Part-Time' ? 'Part-Time' : 'Full-Time',
        }).save();
      }
    }
  } else {
    // Reuse inactive / pending-activation account — do not create a duplicate
    const fields = copyPendingToUserFields(pending);
    Object.assign(user, {
      ...fields,
      isActive: false,
      activationStatus: 'Pending Activation',
      pendingRegistrationId: pending._id,
    });
    if (!user.offerLetter) user.offerLetter = {};
    if (!user.offerLetter.status || user.offerLetter.status === 'Not Generated') {
      user.offerLetter.status = user.offerLetter.status || 'Not Generated';
      user.offerLetter.preparedAt = user.offerLetter.preparedAt || new Date();
      user.offerLetter.preparedBy = adminUserId || user.offerLetter.preparedBy || null;
      user.offerLetter.details = {
        ...(user.offerLetter.details || {}),
        candidateName: user.offerLetter.details?.candidateName || pending.name || '',
        email: user.offerLetter.details?.email || pending.email || '',
        phone: user.offerLetter.details?.phone || pending.phone || '',
        addressLine1: user.offerLetter.details?.addressLine1 || pending.address || '',
        designation: user.offerLetter.details?.designation || pending.position || '',
        department: user.offerLetter.details?.department || pending.department || '',
        company: user.offerLetter.details?.company || pending.company || '',
        salary:
          user.offerLetter.details?.salary ||
          (pending.salary != null ? String(pending.salary) : ''),
        joiningDate:
          user.offerLetter.details?.joiningDate ||
          (pending.dateOfJoining
            ? new Date(pending.dateOfJoining).toISOString().slice(0, 10)
            : ''),
        offerDate:
          user.offerLetter.details?.offerDate ||
          new Date().toISOString().slice(0, 10),
        employmentType:
          user.offerLetter.details?.employmentType ||
          (pending.employmentType === 'Part-Time' ? 'Part-Time' : 'Full-Time'),
        letterTemplate: user.offerLetter.details?.letterTemplate || 'Standard',
      };
    }
    await user.save();
  }

  pending.linkedUserId = user._id;
  await pending.save();

  return { user, pending };
}

function ensureOfferMutable(user) {
  const status = user.offerLetter?.status || 'Not Generated';
  if (status === 'Accepted') {
    const err = new Error('Offer already accepted');
    err.status = 400;
    throw err;
  }
  if (status === 'Declined') {
    const err = new Error('Offer was declined; generate a new offer cycle if needed');
    err.status = 400;
    throw err;
  }
}

async function saveOfferDetails(userId, details, adminUserId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Employee not found');
    err.status = 404;
    throw err;
  }
  ensureOfferMutable(user);

  if (!user.offerLetter) user.offerLetter = {};
  const nextDetails = {
    ...(user.offerLetter.details?.toObject?.() || user.offerLetter.details || {}),
    ...details,
  };

  const nextSnap = snapshotOfferDetails(nextDetails);
  const prevSnap = user.offerLetter.detailsSnapshot || '';
  const hadPdf = Boolean(user.offerLetter.pdfUrl) && (user.offerLetter.pdfVersion || 0) > 0;

  user.offerLetter.details = nextDetails;

  // Sync core profile fields that admin may correct in the offer form
  if (nextDetails.designation) user.position = nextDetails.designation;
  if (nextDetails.department) user.department = nextDetails.department;
  if (nextDetails.company) user.company = nextDetails.company;
  if (nextDetails.salary !== undefined && nextDetails.salary !== '') {
    const n = Number(String(nextDetails.salary).replace(/[^0-9.]/g, ''));
    if (!Number.isNaN(n)) user.salary = n;
  }
  if (nextDetails.joiningDate) {
    const d = new Date(`${nextDetails.joiningDate}T12:00:00`);
    if (!Number.isNaN(d.getTime())) user.dateOfJoining = d;
  }
  if (nextDetails.candidateName) user.name = nextDetails.candidateName;
  if (nextDetails.addressLine1 || nextDetails.addressLine2) {
    user.address = [nextDetails.addressLine1, nextDetails.addressLine2]
      .filter(Boolean)
      .join(', ');
  }

  if (hadPdf && prevSnap && prevSnap !== nextSnap) {
    user.offerLetter.pdfOutdated = true;
    // Mark previous letter copies of type offer as outdated
    if (Array.isArray(user.letterCopies)) {
      user.letterCopies.forEach((lc) => {
        if (String(lc.letterType || '').toLowerCase() === 'offer') {
          lc.outdated = true;
        }
      });
    }
  }

  user.markModified('offerLetter');
  await user.save();
  return user;
}

async function recordOfferPdfGenerated(userId, { pdfUrl, pdfFilename, details }) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Employee not found');
    err.status = 404;
    throw err;
  }
  ensureOfferMutable(user);

  if (!user.offerLetter) user.offerLetter = {};
  if (details && typeof details === 'object') {
    user.offerLetter.details = {
      ...(user.offerLetter.details?.toObject?.() || user.offerLetter.details || {}),
      ...details,
    };
  }

  const snap = snapshotOfferDetails(user.offerLetter.details || {});
  const nextVersion = (user.offerLetter.pdfVersion || 0) + 1;

  // Mark older offer PDFs outdated
  if (Array.isArray(user.letterCopies)) {
    user.letterCopies.forEach((lc) => {
      if (String(lc.letterType || '').toLowerCase() === 'offer') {
        lc.outdated = true;
      }
    });
  }

  user.offerLetter.pdfUrl = pdfUrl || user.offerLetter.pdfUrl || '';
  user.offerLetter.pdfFilename = pdfFilename || user.offerLetter.pdfFilename || 'Offer Letter.pdf';
  user.offerLetter.pdfVersion = nextVersion;
  user.offerLetter.generatedAt = new Date();
  user.offerLetter.pdfOutdated = false;
  user.offerLetter.detailsSnapshot = snap;
  user.offerLetter.lastEmailError = '';
  // Invalidate any previously emailed acceptance link until re-sent
  user.offerLetter.acceptanceTokenHash = '';
  user.offerLetter.tokenExpiresAt = null;
  user.offerLetter.tokenUsedAt = null;
  if (
    user.offerLetter.status === 'Not Generated' ||
    user.offerLetter.status === 'Expired' ||
    user.offerLetter.status === 'Sent' ||
    user.offerLetter.status === 'Declined'
  ) {
    user.offerLetter.status = 'Generated';
  }

  user.markModified('offerLetter');
  await user.save();
  return user;
}

async function issueAcceptanceToken(user) {
  const raw = generateRawToken();
  const hash = hashToken(raw);
  user.offerLetter.acceptanceTokenHash = hash;
  user.offerLetter.tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  user.offerLetter.tokenUsedAt = null;
  user.markModified('offerLetter');
  await user.save();
  return raw;
}

function buildAcceptUrl(rawToken) {
  return `${getFrontendBase().replace(/\/$/, '')}/accept-offer/${encodeURIComponent(rawToken)}`;
}

async function sendOfferEmail(userId, { pdfBase64, filename } = {}) {
  const user = await User.findById(userId).select('+offerLetter.acceptanceTokenHash');
  if (!user) {
    const err = new Error('Employee not found');
    err.status = 404;
    throw err;
  }
  ensureOfferMutable(user);

  if (!user.offerLetter?.pdfUrl && !pdfBase64) {
    const err = new Error('Generate the Offer Letter PDF before sending');
    err.status = 400;
    throw err;
  }
  if (user.offerLetter.pdfOutdated) {
    const err = new Error('Offer details changed after PDF generation. Regenerate the PDF before sending.');
    err.status = 400;
    throw err;
  }
  if ((user.offerLetter.pdfVersion || 0) < 1 && !pdfBase64) {
    const err = new Error('No generated Offer Letter PDF found');
    err.status = 400;
    throw err;
  }

  const toEmail =
    (user.offerLetter.details?.email || user.email || '').trim();
  if (!toEmail) {
    const err = new Error('Employee email is required to send the offer');
    err.status = 400;
    throw err;
  }

  const companyName =
    user.offerLetter.details?.company ||
    user.company ||
    'Urbancode Edutech Solutions Pvt. Ltd.';
  const candidateName =
    user.offerLetter.details?.candidateName || user.name || 'Candidate';

  const rawToken = await issueAcceptanceToken(user);
  const acceptUrl = buildAcceptUrl(rawToken);

  const transporter = require('../config/emailConfig');
  const localEmailLog =
    String(process.env.LOCAL_EMAIL_LOG || '').toLowerCase() === 'true';

  const subject = `Your Official Offer Letter – ${companyName}`;
  const text = `Dear ${candidateName},

We are pleased to confirm your offer of employment with ${companyName}.

Please review the attached Offer Letter carefully. To accept or decline this offer, use the secure link below (this link expires in 7 days and can be used only once):

${acceptUrl}

If you have any questions, please contact the HR / Admin team.

Regards,
${companyName}`;

  const html = `
  <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; max-width: 640px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #0b2d67; margin-top: 0;">Official Offer Letter</h2>
    <p>Dear <strong>${candidateName}</strong>,</p>
    <p>We are pleased to confirm your offer of employment with <strong>${companyName}</strong>.</p>
    <p>Please review the attached Offer Letter carefully. When you are ready, use the button below to securely accept or decline the offer.</p>
    <p style="margin: 28px 0;">
      <a href="${acceptUrl}"
         style="background:#0b2d67;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600;">
        Accept Offer Letter
      </a>
    </p>
    <p style="font-size: 13px; color: #555;">Or open this secure link:<br/>
      <a href="${acceptUrl}" style="color:#0b2d67;">${acceptUrl}</a>
    </p>
    <p style="font-size: 12px; color: #888;">This link expires in 7 days and can be used only once. Do not share it.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
    <p style="font-size:12px;color:#888;">Automated message from ${companyName}.</p>
  </div>`;

  const attachments = [];
  if (pdfBase64) {
    const cleanBase64 = String(pdfBase64).replace(/^data:application\/pdf;base64,/, '');
    attachments.push({
      filename: filename || user.offerLetter.pdfFilename || `${candidateName}-Offer-Letter.pdf`,
      content: Buffer.from(cleanBase64, 'base64'),
      contentType: 'application/pdf',
    });
  }

  try {
    let messageId = `local-${Date.now()}`;
    if (transporter.isEmailConfigured()) {
      const fromAddress = transporter.getSenderFromAddress();
      const info = await transporter.sendMail({
        from: fromAddress,
        to: toEmail,
        subject,
        text,
        html,
        attachments,
      });
      messageId = info.messageId;
    } else if (localEmailLog) {
      console.log('\n========== LOCAL OFFER LETTER EMAIL (not sent) ==========');
      console.log('To:', toEmail);
      console.log('Subject:', subject);
      console.log('Accept URL:', acceptUrl);
      console.log('Attachment:', attachments[0]?.filename || '(none)');
      console.log('==========================================================\n');
    } else {
      transporter.assertEmailConfigured();
    }

    // Targeted $set only — never reload+save offerLetter without acceptanceTokenHash
    // (select:false + markModified('offerLetter') was wiping the hash and breaking accept links)
    const sentAt = new Date();
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          'offerLetter.status': 'Sent',
          'offerLetter.sentAt': sentAt,
          'offerLetter.lastEmailError': '',
        },
      }
    );

    return {
      message: localEmailLog && !transporter.isEmailConfigured()
        ? 'Offer letter marked Sent (local email log — SMTP not configured)'
        : 'Offer letter sent successfully',
      messageId,
      toEmail,
      acceptUrl,
      sentAt,
      status: 'Sent',
    };
  } catch (emailErr) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          'offerLetter.lastEmailError': emailErr.message || 'Failed to send email',
        },
      }
    );
    const err = new Error(emailErr.message || 'Failed to send offer email');
    err.status = 500;
    throw err;
  }
}

async function findUserByAcceptanceToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    const err = new Error('Invalid acceptance token');
    err.status = 400;
    throw err;
  }
  const hash = hashToken(rawToken.trim());
  const user = await User.findOne({
    'offerLetter.acceptanceTokenHash': hash,
  }).select('+offerLetter.acceptanceTokenHash');

  if (!user) {
    const err = new Error('Invalid or unknown acceptance link');
    err.status = 404;
    throw err;
  }
  return user;
}

function assertTokenUsable(user) {
  const ol = user.offerLetter || {};
  if (ol.tokenUsedAt) {
    const err = new Error('This offer link has already been used');
    err.status = 410;
    throw err;
  }
  if (ol.tokenExpiresAt && new Date(ol.tokenExpiresAt).getTime() < Date.now()) {
    if (ol.status === 'Sent') {
      user.offerLetter.status = 'Expired';
    }
    const err = new Error('This offer link has expired');
    err.status = 410;
    throw err;
  }
  if (ol.status === 'Accepted') {
    const err = new Error('Offer already accepted');
    err.status = 409;
    throw err;
  }
  if (ol.status === 'Declined') {
    const err = new Error('Offer already declined');
    err.status = 409;
    throw err;
  }
  if (ol.status === 'Expired') {
    const err = new Error('This offer has expired');
    err.status = 410;
    throw err;
  }
}

function publicOfferSummary(user) {
  const d = user.offerLetter?.details || {};
  return {
    employeeName: d.candidateName || user.name || '',
    designation: d.designation || user.position || '',
    department: d.department || user.department || '',
    company: d.company || user.company || '',
    salary: d.salary || (user.salary != null ? String(user.salary) : ''),
    joiningDate: d.joiningDate || '',
    workLocation: d.workLocation || '',
    employmentType: d.employmentType || '',
    probationPeriod: d.probationPeriod || '',
    noticePeriod: d.noticePeriod || '',
    reportingManager: d.reportingManager || '',
    offerStatus: user.offerLetter?.status || 'Not Generated',
    tokenExpiresAt: user.offerLetter?.tokenExpiresAt || null,
  };
}

async function finalizeAcceptedUser(claimed) {
  try {
    let pending = null;
    if (claimed.pendingRegistrationId) {
      pending = await PendingUser.findById(claimed.pendingRegistrationId);
    }
    if (!pending) {
      pending = await PendingUser.findOne({
        $or: [{ linkedUserId: claimed._id }, { email: claimed.email }],
      });
    }
    if (pending) {
      pending.registrationStatus = 'Approved';
      pending.approvedAt = new Date();
      await pending.save();
      await PendingUser.findByIdAndDelete(pending._id);
      claimed.pendingRegistrationId = null;
      await claimed.save();
    }
  } catch (cleanupErr) {
    console.error('Offer accept post-activation cleanup failed:', cleanupErr);
    cleanupErr.message = `Offer accepted and account activated, but registration cleanup failed: ${cleanupErr.message}. Please verify Admin pending list.`;
    cleanupErr.status = 500;
    cleanupErr.partialSuccess = true;
    cleanupErr.user = claimed;
    throw cleanupErr;
  }

  try {
    const { notifyNewUserApprovedSafe } = require('./newUserWishService');
    notifyNewUserApprovedSafe(claimed);
  } catch (_) {
    /* non-fatal */
  }
  try {
    await notifyAdminsOfferDecision(claimed, 'accepted');
  } catch (_) {
    /* non-fatal */
  }

  return { user: claimed, summary: publicOfferSummary(claimed) };
}

async function acceptOffer(rawToken) {
  const hash = hashToken(String(rawToken || '').trim());
  // Atomic claim: only one concurrent accept can win
  const claimed = await User.findOneAndUpdate(
    {
      'offerLetter.acceptanceTokenHash': hash,
      'offerLetter.tokenUsedAt': null,
      'offerLetter.status': { $in: ['Sent', 'Generated'] },
      $or: [
        { 'offerLetter.tokenExpiresAt': null },
        { 'offerLetter.tokenExpiresAt': { $gt: new Date() } },
      ],
    },
    {
      $set: {
        'offerLetter.tokenUsedAt': new Date(),
        'offerLetter.status': 'Accepted',
        'offerLetter.acceptedAt': new Date(),
        'offerLetter.acceptanceTokenHash': '',
        isActive: true,
        activationStatus: 'Active',
        dateOfRelieving: null,
      },
    },
    { new: true }
  ).select('+offerLetter.acceptanceTokenHash');

  if (!claimed) {
    const existing = await User.findOne({
      'offerLetter.acceptanceTokenHash': hash,
    }).select('+offerLetter.acceptanceTokenHash');
    if (!existing) {
      const err = new Error('Invalid, expired, or already-used acceptance link');
      err.status = 410;
      throw err;
    }
    assertTokenUsable(existing);
    const err = new Error('Unable to accept offer');
    err.status = 400;
    throw err;
  }

  return finalizeAcceptedUser(claimed);
}

/**
 * Admin button path: accept offer + approve pending + activate login (no email token).
 */
async function acceptOfferByAdmin(userId) {
  const user = await User.findById(userId).select('+offerLetter.acceptanceTokenHash');
  if (!user) {
    const err = new Error('Employee not found');
    err.status = 404;
    throw err;
  }

  if (user.isActive && user.offerLetter?.status === 'Accepted') {
    return {
      user,
      summary: publicOfferSummary(user),
      alreadyActive: true,
    };
  }

  if (user.offerLetter?.status === 'Declined') {
    const err = new Error('This offer was declined. Prepare/send a new offer before activating.');
    err.status = 409;
    throw err;
  }

  const now = new Date();
  if (!user.offerLetter) user.offerLetter = {};
  user.offerLetter.status = 'Accepted';
  user.offerLetter.acceptedAt = now;
  user.offerLetter.tokenUsedAt = now;
  user.offerLetter.acceptanceTokenHash = '';
  user.offerLetter.tokenExpiresAt = null;
  user.isActive = true;
  user.activationStatus = 'Active';
  user.dateOfRelieving = null;
  user.markModified('offerLetter');
  await user.save();

  return finalizeAcceptedUser(user);
}

async function declineOffer(rawToken) {
  const user = await findUserByAcceptanceToken(rawToken);
  assertTokenUsable(user);

  const now = new Date();
  user.offerLetter.status = 'Declined';
  user.offerLetter.declinedAt = now;
  user.offerLetter.tokenUsedAt = now;
  user.offerLetter.acceptanceTokenHash = '';
  // Keep inactive — do not activate
  user.isActive = false;
  user.activationStatus = 'Pending Activation';
  user.markModified('offerLetter');
  await user.save();

  try {
    await notifyAdminsOfferDecision(user, 'declined');
  } catch (_) {
    /* non-fatal */
  }

  return { user, summary: publicOfferSummary(user) };
}

async function notifyAdminsOfferDecision(user, decision) {
  const transporter = require('../config/emailConfig');
  if (typeof transporter.assertEmailConfigured === 'function') {
    try {
      transporter.assertEmailConfigured();
    } catch {
      return;
    }
  }
  const d = user.offerLetter?.details || {};
  const name = d.candidateName || user.name;
  const subject =
    decision === 'accepted'
      ? `Offer Accepted – ${name}`
      : `Offer Declined – ${name}`;
  const panelLink = `${getFrontendBase().replace(/\/$/, '')}/pending-users`;
  const html = `
    <div style="font-family:Arial,sans-serif;padding:16px;">
      <h3 style="color:#0b2d67;">Offer ${decision === 'accepted' ? 'Accepted' : 'Declined'}</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Designation:</strong> ${d.designation || user.position || '—'}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      <p><a href="${panelLink}">Open Admin Panel</a></p>
    </div>`;
  const to = [
    process.env.NOTIFY_EMAIL,
    'admin@urbancode.in',
  ].filter(Boolean);
  await transporter.sendMail({
    from: transporter.getSenderFromAddress?.() || process.env.NOTIFY_EMAIL,
    to,
    subject,
    html,
    text: `Offer ${decision}: ${name} (${user.email})`,
  });
}

module.exports = {
  getFrontendBase,
  snapshotOfferDetails,
  prepareOfferFromPending,
  saveOfferDetails,
  recordOfferPdfGenerated,
  sendOfferEmail,
  findUserByAcceptanceToken,
  assertTokenUsable,
  publicOfferSummary,
  acceptOffer,
  acceptOfferByAdmin,
  declineOffer,
  notifyAdminsOfferDecision,
  buildAcceptUrl,
  copyPendingToUserFields,
};
