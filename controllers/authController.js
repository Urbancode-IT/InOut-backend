// -----------------------------
// 📁 controllers/authController.js
// -----------------------------
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PendingUser = require('../models/PendingUser');
const transporter = require('../config/emailConfig');

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

  register: async (req, res) => {
    try {
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
        profilePic,
        bloodGroup,
        address,
        bankDetails,
        schedule
      } = req.body;

      // Validate required fields
      if (!name || !email || !password || !phone || !position || !company) {
        return res.status(400).json({ error: 'All required fields must be filled' });
      }

      // Check duplicates
      const existingUser = await User.findOne({ email });
      const existingPending = await PendingUser.findOne({ email });

      if (existingUser || existingPending) {
        return res.status(400).json({ error: 'Email already in use or pending approval' });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create pending user with all schema fields
      const pending = new PendingUser({
        name,
        email,
        password: hashedPassword,
        phone,
        position,
        company,
        salary: salary || 0,
        department,
        qualification,
        dateOfJoining,
        dateOfBirth,
        rolesAndResponsibility: rolesAndResponsibility || [],
        skills: skills || [],
        profilePic: profilePic || '',
        bloodGroup,
        address,

        bankDetails,
        schedule
      });

      await pending.save();

      // Email Notification
      const mailOptions = {
        from: process.env.NOTIFY_EMAIL,
        to: [
          process.env.NOTIFY_EMAIL,
          'admin@urbancode.in',
          'wepenit2020@gmail.com',
          'jayaprathap.rajan27@gmail.com',

        ],
        subject: '🚀 New User Registration Alert for INOUT!',
        html: `
        <div style="font-family: Arial, sans-serif; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px; background: #f9f9ff;">
          <h2 style="color: #6366f1;">👤 New Registration Received for InOut</h2>
          <p><strong>👨‍💼 Name:</strong> ${pending.name}</p><br/>
          <p><strong>📧 Email:</strong> ${pending.email}</p><br/>
          <p><strong>📱 Phone:</strong> ${pending.phone || 'N/A'}</p><br/>
          <p><strong>🏢 Company Role:</strong> ${pending.position} - ${pending.company}</p><br/>

          <hr style="margin: 20px 0;" />

          <p style="font-size: 14px;">🔐 Action Required: Login to the 
            <a href="https://inout.urbancode.tech/" style="color: #4f46e5;">Admin Panel</a> to approve this user.
          </p>
          <p style="font-size: 13px; color: #999;">📅 ${new Date().toLocaleString()}</p>
        </div>
      `
      };

      transporter.sendMail(mailOptions);

      res.status(201).json({ message: 'Registration submitted and pending admin approval' });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

};

module.exports = authController;
