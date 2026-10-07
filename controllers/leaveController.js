// -----------------------------
// ðŸ“ controllers/leaveController.js
// -----------------------------
const LeaveRequest = require('../models/LeaveRequest');
const transporter = require('../config/emailConfig');
const User = require('../models/User');
const axios = require('axios');


const leaveController = {
  applyLeave: async (req, res) => {
    try {
      const { fromDate, toDate, reason, leaveType } = req.body;
      if (!fromDate || !toDate || !reason) {
        return res.status(400).json({ error: 'Missing fields' });
      }
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const leave = new LeaveRequest({
        user: user._id,
        fromDate,
        toDate,
        reason,
        leaveType
      });

      await leave.save();

      const mailOptions = {
        from: `InOut Portal -<${process.env.NOTIFY_EMAIL}>`,
        to: [
          process.env.NOTIFY_EMAIL,
          'admin@urbancode.in',
          'krithika@urbancode.in',
          'wepenit2020@gmail.com',
          'jayaprathap.rajan27@gmail.com',

        ],
        subject: 'New Leave Request Submitted ðŸŒ´â€“ INOUT Portal',
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e8ff; border-radius: 12px; padding: 25px; background: linear-gradient(to bottom, #f7faff, #ffffff); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
    <div style="display: flex; align-items: center; margin-bottom: 20px;">
        <div style="background-color: #1d4ed8; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; font-size: 20px;">ðŸ“…</div>
        <h2 style="color: #1d4ed8; margin: 0; font-size: 22px;">New Leave Request Submitted</h2>
    </div>
    
    <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: 120px 1fr; gap: 12px 0;">
            <div style="font-weight: 600; color: #4b5563;">ðŸ‘¤ Employee:</div>
            <div>${user.name}</div>
            <br />
            <div style="font-weight: 600; color: #4b5563;">âœ‰ï¸ Email:</div>
            <div>${user.email}</div>
            <br />
            
            <div style="font-weight: 600; color: #4b5563;">ðŸ¢ Position:</div>
            <div>${user.position} - ${user.company}</div>
            <br />

            <div style="font-weight: 600; color: #4b5563;">ðŸ›« Leave Dates:</div>
            <div>${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()} (${Math.ceil((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24) + 1)} days)</div>
            <br />
            
            <div style="font-weight: 600; color: #4b5563;">ðŸ“ Leave Type:</div>
            <div>${leaveType || 'N/A'}</div>
            <br />

            <div style="font-weight: 600; color: #4b5563;">ðŸ“Œ Reason:</div>
            <div>${reason}</div>
        </div>
    </div>
    
    <div style="background-color: #eef2ff; border-left: 4px solid #1d4ed8; padding: 15px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
        <p style="margin: 0; font-weight: 600; color: #1d4ed8; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">ðŸ”</span>
            <span>Action Required: Review this leave request</span>
        </p>
        <p style="margin: 10px 0 0 0; font-size: 14px; color: #4b5563;">
            Please log in to the <a href="https://inout.urbancode.tech/" style="color: #1d4ed8; text-decoration: none; font-weight: 600;">Admin Panel</a> to approve or reject this request.
        </p>
    </div>
    
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 15px;">
        <div style="display: flex; align-items: center; gap: 6px;">
            <span>ðŸ•’</span>
            <span>Submitted on ${new Date().toLocaleString()}</span>
        </div>
        <div style="font-weight: 600;">
            ${user.company} , InOut Team
        </div>
    </div>
</div>
        `
      };

      transporter.sendMail(mailOptions);


      // List of admin WhatsApp numbers (with country code, no "+")
      const adminNumbers = [
        '919003177131', //Sivagaminathan
        '919650308989',  // Krithika
        '919080258870',  // Jayaprathap

      ];

      // Dynamic WhatsApp message template
      // Dynamic WhatsApp message template
      function createWhatsAppTemplatePayload(number, user, fromDate, toDate, leaveType, reason) {
        const days =
          Math.ceil(
            (new Date(toDate) - new Date(fromDate)) /
            (1000 * 60 * 60 * 24)
          ) + 1;

        return {
          to: number, // No '+' prefix, AskEva expects digits only
          type: "template",
          template: {
            language: {
              policy: "deterministic",
              code: "en"
            },
            name: "leave_request_notification", // replace with your approved template name
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: user.company },
                  { type: "text", text: user.name },
                  { type: "text", text: user.position },
                  { type: "text", text: `${new Date(fromDate).toLocaleDateString()} â†’ ${new Date(toDate).toLocaleDateString()}` },
                  { type: "text", text: `${days} days` },
                  { type: "text", text: leaveType || 'N/A' },
                  { type: "text", text: reason || 'No reason provided' },
                  { type: "text", text: `https://inout.urbancode.tech/` },
                  { type: "text", text: new Date().toLocaleString() }
                ]
              }
            ]
          }
        };
      }
      // Send to all admins
      async function notifyAdminsOnWhatsApp(user, fromDate, toDate, leaveType, reason) {
        for (const number of adminNumbers) {
          try {
            const payload = createWhatsAppTemplatePayload(number, user, fromDate, toDate, leaveType, reason);

            const res = await axios.post(
              `https://backend.askeva.io/v1/message/send-message?token=${process.env.ASKEVA_API_KEY}`,
              payload,
              {
                headers: { "Content-Type": "application/json" }
              }
            );

            console.log(`âœ… Sent to ${number}:`, res.data);
          } catch (error) {
            console.error(`âŒ Failed for ${number}:`, error.response?.data || error.message);
          }
        }
      }


      notifyAdminsOnWhatsApp();
      res.status(201).json({ message: 'Leave request submitted' });
    } catch (err) {
      console.error('Leave apply error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getAllLeaveRequests: async (req, res) => {
    try {
      const requests = await LeaveRequest.find().populate('user', 'name email');
      res.json(requests);
    } catch (err) {
      console.error('Fetch leave requests error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  updateLeaveStatus: async (req, res) => {
    try {
      const { status } = req.body;
      if (!['Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const updated = await LeaveRequest.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).populate('user', 'name email');

      if (!updated) {
        return res.status(404).json({ error: 'Leave request not found' });
      }
      // Check if user has email
      if (!updated.user?.email) {
        return res.status(400).json({ error: 'No email found for this user' });
      }

      const mailOptions = {
        from: `InOut Portal - <${process.env.NOTIFY_EMAIL}>`,
        to: updated.user.email,
        subject: `Your Leave Request Has Been ${status}`,
        html: `
                <!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .email-container {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 25px;
            background-color: #ffffff;
        }
        .header {
            color: #2c3e50;
            font-size: 24px;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
        }
        .status {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 4px;
            font-weight: bold;
            margin: 10px 0;
        }
        .approved {
            background-color: #d4edda;
            color: #155724;
        }
        .rejected {
            background-color: #f8d7da;
            color: #721c24;
        }
        .pending {
            background-color: #fff3cd;
            color: #856404;
        }
        .details {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
        }
        .detail-row {
            margin-bottom: 8px;
        }
        .detail-label {
            font-weight: bold;
            color: #495057;
            display: inline-block;
            width: 100px;
        }
        .footer {
            margin-top: 25px;
            padding-top: 15px;
            border-top: 1px solid #eee;
            color: #6c757d;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">Leave Request Update</div>
        
        <p>Hi ${updated.user.name || 'Employee'},</p>
        
        <p>Your leave request has been reviewed:</p>
        
        <div class="status ${status.toLowerCase()}">
            ${status.toUpperCase()}
        </div>
        
        <div class="details">
            <div class="detail-row">
                <span class="detail-label">Dates:</span>
                ${updated.fromDate.toDateString()} to ${updated.toDate.toDateString()}
            </div>
            <div class="detail-row">
                <span class="detail-label">Leave Type:</span>
                ${updated.leaveType}
            </div>
            <div class="detail-row">
                <span class="detail-label">Reason:</span>
                ${updated.reason}
            </div>
        </div>
        
        <p>If you have any questions about this decision, please contact Management.</p>
        
        <div class="footer">
            <p>Best regards,<br><strong>InOut Team</strong></p>
        </div>
    </div>
</body>
</html>
      `
      };

      await transporter.sendMail(mailOptions);

      res.json({ message: `Leave ${status.toLowerCase()}`, request: updated });
    } catch (err) {
      console.error('Update leave error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getMyLeaves: async (req, res) => {
    try {
      const leaves = await LeaveRequest.find({ user: req.user._id }).sort({ createdAt: -1 });
      res.json(leaves);
    } catch (err) {
      console.error('Fetch my leaves error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  deleteLeaveRequest: async (req, res) => {
    try {
      const deleted = await LeaveRequest.findByIdAndDelete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Leave request not found' });
      }
      res.json({ message: 'Leave request deleted successfully' });
    } catch (err) {
      console.error('Delete leave request error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = leaveController;
