// -----------------------------
// 📁 controllers/userController.js
// -----------------------------
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const {
  clearIncompleteTrackingIfComplete,
  unlockIfProfileComplete,
  getMissingProfileFields,
} = require('../utils/profileCompletion');
const {
  maskSensitiveUserFields,
  maskSensitiveUserList,
} = require('../utils/sensitiveUserFields');

const withProfileCompletion = (user) => {
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  const missingFields = getMissingProfileFields(user);
  obj.profileIncomplete = missingFields.length > 0;
  obj.missingFields = missingFields;
  return obj;
};

const applyBankDetailsToUpdate = (updateData, bankDetails) => {
  if (!bankDetails || typeof bankDetails !== 'object') return;
  Object.entries(bankDetails).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      updateData[`bankDetails.${key}`] = value;
    }
  });
};

const userController = {
  getAllUsers: async (req, res) => {
    try {
  const users = await User.find( { name: { $ne: "Admin" } },{
         
        name: 1,
        email: 1,
        role: 1,
        phone: 1,
  dateOfBirth: 1,
        position: 1,
        company: 1,
        salary: 1,
        department: 1,
        branch: 1,
        works: 1,
        qualification: 1,
        dateOfJoining: 1,
    dateOfRelieving: 1,
  address: 1,
  bloodGroup:  1,
        isActive: 1,
    profilePic: 1,
    letterCopies: 1,
        skills: 1,
        rolesAndResponsibility: 1,
        bankDetails: 1,
        pan: 1,
        uan: 1,
        esiNumber: 1,
        empGrade: 1,
        adminComments: 1,
        employeeId: 1,
        attendanceLocked: 1,
        profileIncompleteSince: 1,
        attendanceLockedAt: 1,
        inoutBlocked: 1,
        inoutBlockedAt: 1,
        inoutBlockedForDate: 1,
        inoutLockWaivedForDate: 1,
        skipAttendanceReminders: 1,
        createdAt: 1,
        updatedAt: 1
      }).sort({name: 1});

      await Promise.all(users.map((user) => unlockIfProfileComplete(user)));

      res.json(maskSensitiveUserList(users, req.user));
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  },

  getSingleUser: async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select('-password');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await unlockIfProfileComplete(user);

      res.json(user);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
  getProfile: async (req, res) => {
    try {
      // auth middleware sets req.user
      const userId = (req.user && req.user._id) || null;

      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const user = await User.findById(userId).select('-password');

      if (!user) return res.status(404).json({ message: 'User not found' });

      await unlockIfProfileComplete(user);

      res.json(maskSensitiveUserFields(withProfileCompletion(user), req.user));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  updateProfile: async (req, res) => {
    try {
      const userId = (req.user && req.user._id) || null;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      if (
        'salary' in req.body ||
        'isActive' in req.body ||
        'empGrade' in req.body
      ) {
        return res.status(403).json({
          message: 'Salary, active status, and employee grade can only be updated by an admin',
        });
      }

      // Only allow a whitelist of updatable fields to avoid mass assignment
      const {
        name,
        email,
        password,
        phone,
        position,
        company,
        address,
        bloodGroup,
        department,
        qualification,
        dateOfJoining,
        dateOfBirth,
        dateOfRelieving,
        skills,
        rolesAndResponsibility,
        profilePic,
        bankDetails,
        branch,
        works,
        pan,
        uan,
        esiNumber,
      } = req.body;

      const updateData = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phone) updateData.phone = phone;
      if (position) updateData.position = position;
      if (company) updateData.company = company;
      if (address) updateData.address = address;
      if (bloodGroup) updateData.bloodGroup = bloodGroup;
      if (department) updateData.department = department;
      if (qualification) updateData.qualification = qualification;
      if (profilePic) updateData.profilePic = profilePic;
      if (Array.isArray(skills)) updateData.skills = skills;
      if (Array.isArray(rolesAndResponsibility)) updateData.rolesAndResponsibility = rolesAndResponsibility;
      applyBankDetailsToUpdate(updateData, bankDetails);
      if (branch !== undefined) updateData.branch = branch;
      if (Array.isArray(works)) updateData.works = works;
      if (pan !== undefined) updateData.pan = pan;
      if (uan !== undefined) updateData.uan = uan;
      if (esiNumber !== undefined) updateData.esiNumber = esiNumber;
    if (dateOfJoining) updateData.dateOfJoining = new Date(dateOfJoining);
    if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
    if (dateOfRelieving) updateData.dateOfRelieving = new Date(dateOfRelieving);
      if (password) updateData.password = await bcrypt.hash(password, 10);

      const updated = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true }).select('-password');

      if (!updated) return res.status(404).json({ message: 'User not found' });

      await clearIncompleteTrackingIfComplete(updated);

      res.json(maskSensitiveUserFields(withProfileCompletion(updated), req.user));
    } catch (error) {
      console.error('Error in updateProfile:', error);
      res.status(500).json({ message: error.message });
    }
  },

  getLoggedInUser: async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select('-password');
      if (!user) return res.status(404).json({ error: 'User not found' });
      await unlockIfProfileComplete(user);
      res.json(maskSensitiveUserFields(withProfileCompletion(user), req.user));
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  acknowledgeInoutUnlockNotice: async (req, res) => {
    try {
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      user.inoutUnlockNoticePending = false;
      await user.save();
      res.json({ inoutUnlockNoticePending: false });
    } catch (error) {
      console.error('Error clearing In-Out unlock notice:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  updateUser: async (req, res) => {
  try {
    console.log("Entering update user");
    const {
      name,
      email,
      password,
      phone,
      position,
      company,
      salary,
      address,
      bloodGroup,
      department,
      qualification,
      dateOfJoining,
      dateOfBirth,
      dateOfRelieving,
      skills,
      rolesAndResponsibility,
      profilePic,
      bankDetails,
      isActive,
      employeeId,
      adminComments,
      skipAttendanceReminders,
      branch,
      works,
      pan,
      uan,
      esiNumber,
      empGrade,
    } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (position !== undefined) updateData.position = position;
    if (company !== undefined) updateData.company = company;
    if (salary !== undefined && salary !== null && salary !== '') updateData.salary = Number(salary);
    if (department !== undefined) updateData.department = department;
    if (qualification !== undefined) updateData.qualification = qualification;
    if (profilePic !== undefined) updateData.profilePic = profilePic;
    if (address !== undefined) updateData.address = address;
    if (bloodGroup !== undefined) updateData.bloodGroup = bloodGroup;
    if (Array.isArray(skills)) updateData.skills = skills;
    if (Array.isArray(rolesAndResponsibility)) updateData.rolesAndResponsibility = rolesAndResponsibility;
    applyBankDetailsToUpdate(updateData, bankDetails);
    if (dateOfJoining !== undefined && dateOfJoining !== null && dateOfJoining !== '') {
      updateData.dateOfJoining = new Date(dateOfJoining);
    }
    if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== '') {
      updateData.dateOfBirth = new Date(dateOfBirth);
    }
    if (dateOfRelieving !== undefined) {
      updateData.dateOfRelieving = dateOfRelieving ? new Date(dateOfRelieving) : null;
    }
    if (password) updateData.password = await bcrypt.hash(password, 10);

    if (isActive !== undefined) updateData.isActive = isActive;
    if (employeeId !== undefined) updateData.employeeId = employeeId;
    if (adminComments !== undefined) updateData.adminComments = adminComments;
    if (skipAttendanceReminders !== undefined) {
      updateData.skipAttendanceReminders = Boolean(skipAttendanceReminders);
    }
    if (branch !== undefined) updateData.branch = branch;
    if (Array.isArray(works)) updateData.works = works;
    if (pan !== undefined) updateData.pan = pan;
    if (uan !== undefined) updateData.uan = uan;
    if (esiNumber !== undefined) updateData.esiNumber = esiNumber;
    if (empGrade !== undefined) updateData.empGrade = empGrade;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).select('-password');

    if (!updatedUser) return res.status(404).json({ error: 'User not found' });

    await clearIncompleteTrackingIfComplete(updatedUser);

    res.json({ message: 'User updated successfully', user: updatedUser });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
},

  updateSalary: async (req, res) => {
    try {
      const { salary } = req.body;
      if (!salary || isNaN(salary)) return res.status(400).json({ error: 'Invalid salary value' });

      const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        { salary },
        { new: true }
      ).select('-password');

      if (!updatedUser) return res.status(404).json({ error: 'User not found' });

      res.json({ message: 'Salary updated successfully', user: updatedUser });
    } catch (error) {
      console.error('Error updating salary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getEmployeesForAttendance: async (req, res) => {
    try {
      const users = await User.find({ role: 'employee' }, '_id name email role employeeId');
      res.json(users);
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Upload profile picture and save URL to user.profilePic
  uploadProfilePic: async (req, res) => {
    try {
      const userId = (req.user && req.user._id) || null;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      // multer-storage-cloudinary sets file.path to the uploaded image URL
      const imageUrl = req.file && (req.file.path || req.file.location || req.file.url);
      if (!imageUrl) return res.status(400).json({ message: 'No image uploaded' });

      const updated = await User.findByIdAndUpdate(userId, { profilePic: imageUrl }, { new: true }).select('-password');
      if (!updated) return res.status(404).json({ message: 'User not found' });

      res.json(maskSensitiveUserFields(updated, req.user));
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Upload a generated letter PDF and attach it to the candidate's user record
  uploadLetter: async (req, res) => {
    try {
      const uploaderId = (req.user && req.user._id) || null;
      if (!uploaderId) return res.status(401).json({ message: 'Unauthorized' });

      // multer memory storage puts file buffer in req.file.buffer
      const file = req.file;
      if (!file || !file.buffer) return res.status(400).json({ message: 'No file uploaded' });

      let candidateId = req.body.candidateId;
      // if caller doesn't provide a candidateId, attach to uploader's own record
      if (!candidateId) candidateId = uploaderId;
      if (!candidateId) return res.status(400).json({ message: 'candidateId is required' });

      const cloudinary = require('../config/cloudinary');
      const {
        sanitizeFilename,
        toDownloadUrl,
        ensurePdfFilename,
      } = require('../utils/letterStorage');

      // upload buffer to Cloudinary (PDF as image type — Cloudinary recommended)
      const streamUpload = (buffer, options) => new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
          if (result) resolve(result);
          else reject(error);
        });
        const { Readable } = require('stream');
        const readable = new Readable();
        readable._read = () => {};
        readable.push(buffer);
        readable.push(null);
        readable.pipe(stream);
      });

      const folder = `letter_copies/${candidateId}`;
      const baseName = sanitizeFilename(file.originalname || 'letter');
      const opts = {
        folder,
        resource_type: 'image',
        format: 'pdf',
        public_id: `${baseName}_${Date.now()}`,
        type: 'upload',
      };
      const result = await streamUpload(file.buffer, opts);

      const fileUrl = result.secure_url || result.url;
      const filename = ensurePdfFilename(
        file.originalname || result.original_filename || `${baseName}.pdf`
      );
      const downloadUrl = toDownloadUrl(fileUrl, filename);

      // push metadata into candidate's record (store viewable PDF URL)
      const updated = await User.findByIdAndUpdate(
        candidateId,
        {
          $push: {
            letterCopies: {
              url: fileUrl,
              filename,
              uploadedBy: uploaderId,
              uploadedAt: new Date(),
            },
          },
        },
        { new: true }
      ).select('-password');
      if (!updated) return res.status(404).json({ message: 'Candidate not found' });

      res.json({
        message: 'Uploaded',
        url: fileUrl,
        downloadUrl,
        user: maskSensitiveUserFields(updated, req.user),
      });
    } catch (error) {
      console.error('Error uploading letter:', error);
      res.status(500).json({ message: error.message });
    }
  },

};

module.exports = userController;
