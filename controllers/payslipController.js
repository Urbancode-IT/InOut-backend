// controllers/payslipController.js
const Payslip = require("../models/Payslip");

const toPlainObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value.toObject === "function") return value.toObject();
  if (typeof value === "object") return { ...value };
  return {};
};

const sumValues = (obj = {}) =>
  Object.values(obj).reduce((acc, n) => acc + (Number(n) || 0), 0);

const canAccessPayslip = (req, payslip) => {
  if (!payslip) return false;
  if (req.user.role === "admin") return true;
  return String(payslip.userId) === String(req.user._id);
};

// @desc Create new payslip
const createPayslip = async (req, res) => {
  try {
    const {
      userId,
      employeeId,
      employeeDetails,
      attendanceSummary,
      incomes,
      deductions,
      totalIncome,
      totalDeductions,
      netPay,
      month,
      year,
      viewModelSnapshot,
    } = req.body;

    if (!userId || !employeeId || !month || !year) {
      return res.status(400).json({ message: "userId, employeeId, month, and year are required" });
    }

    const calcTotalIncome = incomes ? Object.values(incomes).reduce((a, b) => a + b, 0) : 0;
    const calcTotalDeductions = deductions ? Object.values(deductions).reduce((a, b) => a + b, 0) : 0;
    const calcNetPay = calcTotalIncome - calcTotalDeductions;

    const payslip = new Payslip({
      userId,
      employeeId,
      employeeDetails,
      attendanceSummary,
      incomes,
      deductions,
      totalIncome: totalIncome ?? calcTotalIncome,
      totalDeductions: totalDeductions ?? calcTotalDeductions,
      netPay: netPay ?? calcNetPay,
      month,
      year,
      viewModelSnapshot: viewModelSnapshot || null,
    });

    await payslip.save();
    res.status(201).json(payslip);
  } catch (error) {
    console.error("Error creating payslip:", error);
    res.status(500).json({ message: "Error saving payslip", error: error.message });
  }
};

// @desc Get payslips (admin: all; others: own only)
const getPayslips = async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { userId: req.user._id };
    const payslips = await Payslip.find(filter).sort({ createdAt: -1 });
    res.json(payslips);
  } catch (error) {
    res.status(500).json({ message: "Error fetching payslips", error });
  }
};

// @desc Get one payslip
const getPayslipById = async (req, res) => {
  try {
    const payslip = await Payslip.findById(req.params.id);
    if (!payslip) return res.status(404).json({ message: "Payslip not found" });
    if (!canAccessPayslip(req, payslip)) {
      return res.status(403).json({ message: "Not allowed to view this payslip" });
    }
    res.json(payslip);
  } catch (error) {
    res.status(500).json({ message: "Error fetching payslip", error: error.message });
  }
};

// @desc Update payslip (admin only)
const updatePayslip = async (req, res) => {
  try {
    const payslip = await Payslip.findById(req.params.id);
    if (!payslip) return res.status(404).json({ message: "Payslip not found" });

    const {
      employeeId,
      employeeDetails,
      attendanceSummary,
      incomes,
      deductions,
      totalIncome,
      totalDeductions,
      netPay,
      month,
      year,
      viewModelSnapshot,
    } = req.body;

    if (employeeId !== undefined) payslip.employeeId = employeeId;
    if (employeeDetails !== undefined) payslip.employeeDetails = employeeDetails;
    if (attendanceSummary !== undefined) payslip.attendanceSummary = attendanceSummary;
    if (month !== undefined) payslip.month = month;
    if (year !== undefined) payslip.year = year;
    if (viewModelSnapshot !== undefined) payslip.viewModelSnapshot = viewModelSnapshot;

    if (incomes !== undefined) payslip.incomes = incomes;
    if (deductions !== undefined) payslip.deductions = deductions;

    const incomeObj =
      incomes !== undefined ? toPlainObject(incomes) : toPlainObject(payslip.incomes);
    const deductionObj =
      deductions !== undefined ? toPlainObject(deductions) : toPlainObject(payslip.deductions);

    const calcTotalIncome = sumValues(incomeObj);
    const calcTotalDeductions = sumValues(deductionObj);

    payslip.totalIncome = totalIncome ?? calcTotalIncome;
    payslip.totalDeductions = totalDeductions ?? calcTotalDeductions;
    payslip.netPay = netPay ?? payslip.totalIncome - payslip.totalDeductions;

    await payslip.save();
    res.json(payslip);
  } catch (error) {
    console.error("Error updating payslip:", error);
    res.status(500).json({ message: "Error updating payslip", error: error.message });
  }
};

// @desc Delete payslip (admin: any; employee: own only)
const deletePayslip = async (req, res) => {
  try {
    const payslip = await Payslip.findById(req.params.id);
    if (!payslip) return res.status(404).json({ message: "Payslip not found" });
    if (!canAccessPayslip(req, payslip)) {
      return res.status(403).json({ message: "Not allowed to delete this payslip" });
    }

    await payslip.deleteOne();
    res.json({ message: "Payslip deleted successfully", id: req.params.id });
  } catch (error) {
    console.error("Error deleting payslip:", error);
    res.status(500).json({ message: "Error deleting payslip", error: error.message });
  }
};

module.exports = {
  createPayslip,
  getPayslips,
  getPayslipById,
  updatePayslip,
  deletePayslip,
};
