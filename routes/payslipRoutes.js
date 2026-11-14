// routes/payslipRoutes.js
const express = require("express");
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const {
  createPayslip,
  getPayslips,
  getPayslipById,
  updatePayslip,
  deletePayslip,
} = require("../controllers/payslipController");

const router = express.Router();

// POST → create payslip (admin / HR only)
router.post("/", auth, role("admin"), createPayslip);

// GET → admin: all payslips; employee: own payslips only
router.get("/", auth, getPayslips);

// GET one
router.get("/:id", auth, getPayslipById);

// PUT → update (admin only)
router.put("/:id", auth, role("admin"), updatePayslip);

// DELETE → admin any; employee own (checked in controller)
router.delete("/:id", auth, deletePayslip);

module.exports = router;
