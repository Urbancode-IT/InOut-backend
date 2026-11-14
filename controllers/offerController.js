const PendingUser = require('../models/PendingUser');
const User = require('../models/User');
const offerLetterService = require('../services/offerLetterService');

function statusFromError(err, fallback = 500) {
  return err.status || fallback;
}

const offerController = {
  /** Admin: full registration details */
  getPendingUserById: async (req, res) => {
    try {
      const pending = await PendingUser.findById(req.params.id).lean();
      if (!pending) return res.status(404).json({ error: 'Pending registration not found' });

      let linkedUser = null;
      if (pending.linkedUserId) {
        linkedUser = await User.findById(pending.linkedUserId)
          .select('-password')
          .lean();
      }

      return res.json({
        ...pending,
        linkedUser,
        offerLetter: linkedUser?.offerLetter || null,
        employeeActivationStatus: linkedUser
          ? linkedUser.activationStatus ||
            (linkedUser.isActive === false ? 'Pending Activation' : 'Active')
          : 'Pending Activation',
      });
    } catch (error) {
      console.error('getPendingUserById:', error);
      return res.status(500).json({ error: 'Failed to load registration' });
    }
  },

  /**
   * Admin: prepare inactive employee + open offer workflow
   * POST /api/admin/pending-users/:id/prepare-offer
   */
  prepareOffer: async (req, res) => {
    try {
      const { user, pending } = await offerLetterService.prepareOfferFromPending(
        req.params.id,
        req.user?._id || req.user?.userId
      );
      return res.json({
        message: 'Offer workflow ready. Employee account is pending activation until offer acceptance.',
        pendingId: pending._id,
        userId: user._id,
        registrationStatus: pending.registrationStatus,
        offerStatus: user.offerLetter?.status || 'Not Generated',
        activationStatus: user.activationStatus || 'Pending Activation',
        isActive: user.isActive,
        offerDetails: user.offerLetter?.details || {},
      });
    } catch (error) {
      console.error('prepareOffer:', error);
      return res.status(statusFromError(error)).json({ error: error.message || 'Failed to prepare offer' });
    }
  },

  /** Admin: get offer state for a user */
  getOffer: async (req, res) => {
    try {
      const user = await User.findById(req.params.userId).select('-password');
      if (!user) return res.status(404).json({ error: 'Employee not found' });
      return res.json({
        userId: user._id,
        name: user.name,
        email: user.email,
        isActive: user.isActive,
        activationStatus: user.activationStatus,
        pendingRegistrationId: user.pendingRegistrationId,
        offerLetter: user.offerLetter,
        previousCompany: user.previousCompany,
        previousWorkExperience: user.previousWorkExperience,
        previousJobRole: user.previousJobRole,
        totalYearsOfExperience: user.totalYearsOfExperience,
        isFresher: user.isFresher,
        workExperience: user.workExperience,
      });
    } catch (error) {
      console.error('getOffer:', error);
      return res.status(500).json({ error: 'Failed to load offer' });
    }
  },

  /** Admin: save editable offer details (marks PDF outdated if changed after generate) */
  saveOfferDetails: async (req, res) => {
    try {
      const user = await offerLetterService.saveOfferDetails(
        req.params.userId,
        req.body?.details || req.body || {},
        req.user?._id
      );
      return res.json({
        message: 'Offer details saved',
        offerLetter: user.offerLetter,
        pdfOutdated: user.offerLetter?.pdfOutdated === true,
      });
    } catch (error) {
      console.error('saveOfferDetails:', error);
      return res.status(statusFromError(error)).json({ error: error.message || 'Failed to save offer details' });
    }
  },

  /**
   * Admin: record that a PDF was generated/uploaded (after client uploadLetter)
   * Body: { pdfUrl, pdfFilename, details? }
   */
  recordGeneratedPdf: async (req, res) => {
    try {
      const { pdfUrl, pdfFilename, details } = req.body || {};
      if (!pdfUrl) {
        return res.status(400).json({ error: 'pdfUrl is required after uploading the letter' });
      }
      const user = await offerLetterService.recordOfferPdfGenerated(req.params.userId, {
        pdfUrl,
        pdfFilename,
        details,
      });
      return res.json({
        message: 'Offer PDF recorded',
        offerLetter: user.offerLetter,
      });
    } catch (error) {
      console.error('recordGeneratedPdf:', error);
      return res.status(statusFromError(error)).json({ error: error.message || 'Failed to record PDF' });
    }
  },

  /**
   * Admin: send offer email with PDF + secure accept link
   * Body: { pdfBase64, filename } (latest PDF bytes required)
   */
  sendOffer: async (req, res) => {
    try {
      const { pdfBase64, filename } = req.body || {};
      if (!pdfBase64) {
        return res.status(400).json({
          error: 'Latest Offer Letter PDF (pdfBase64) is required to send. Generate and confirm preview first.',
        });
      }
      const result = await offerLetterService.sendOfferEmail(req.params.userId, {
        pdfBase64,
        filename,
      });
      return res.json(result);
    } catch (error) {
      console.error('sendOffer:', error);
      return res.status(statusFromError(error)).json({ error: error.message || 'Failed to send offer letter' });
    }
  },

  /**
   * Admin: Accept & Activate button (no email token)
   * POST /api/admin/offers/:userId/accept
   */
  acceptOfferAsAdmin: async (req, res) => {
    try {
      const { user, summary, alreadyActive } = await offerLetterService.acceptOfferByAdmin(
        req.params.userId
      );
      return res.json({
        message: alreadyActive
          ? 'Employee is already active.'
          : 'Offer accepted. Registration approved and employee login is now active.',
        offer: summary,
        userId: user._id,
        isActive: true,
        activationStatus: 'Active',
        registrationStatus: 'Approved',
      });
    } catch (error) {
      console.error('acceptOfferAsAdmin:', error);
      if (error.partialSuccess) {
        return res.status(200).json({
          message: error.message,
          warning: true,
          offer: offerLetterService.publicOfferSummary(error.user),
          isActive: true,
        });
      }
      return res.status(statusFromError(error)).json({
        error: error.message || 'Failed to accept and activate employee',
      });
    }
  },

  // ---------- Public acceptance (token-secured) ----------

  getOfferByToken: async (req, res) => {
    try {
      const user = await offerLetterService.findUserByAcceptanceToken(req.params.token);
      try {
        offerLetterService.assertTokenUsable(user);
      } catch (tokenErr) {
        // Still return summary with error status for UI messaging
        return res.status(tokenErr.status || 410).json({
          error: tokenErr.message,
          offer: offerLetterService.publicOfferSummary(user),
        });
      }
      return res.json({ offer: offerLetterService.publicOfferSummary(user) });
    } catch (error) {
      console.error('getOfferByToken:', error);
      return res.status(statusFromError(error, 404)).json({ error: error.message || 'Offer not found' });
    }
  },

  acceptOffer: async (req, res) => {
    try {
      const { user, summary } = await offerLetterService.acceptOffer(req.params.token);
      return res.json({
        message: 'Offer accepted. Your employee account is now active. You can log in with your registered email and password.',
        offer: summary,
        userId: user._id,
        isActive: true,
        activationStatus: 'Active',
        registrationStatus: 'Approved',
      });
    } catch (error) {
      console.error('acceptOffer:', error);
      if (error.partialSuccess) {
        return res.status(200).json({
          message: error.message,
          warning: true,
          offer: offerLetterService.publicOfferSummary(error.user),
          isActive: true,
        });
      }
      return res.status(statusFromError(error)).json({ error: error.message || 'Failed to accept offer' });
    }
  },

  declineOffer: async (req, res) => {
    try {
      const { summary } = await offerLetterService.declineOffer(req.params.token);
      return res.json({
        message: 'Offer declined. Your account was not activated.',
        offer: summary,
        isActive: false,
        activationStatus: 'Pending Activation',
      });
    } catch (error) {
      console.error('declineOffer:', error);
      return res.status(statusFromError(error)).json({ error: error.message || 'Failed to decline offer' });
    }
  },
};

module.exports = offerController;
