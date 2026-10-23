const PDFDocument = require('pdfkit');
const { viewModelFromPayslip, displayDash } = require('./payslipViewModel');

const GREEN = '#149c63';
const BLACK = '#1a1a1a';

const money = (amount) =>
  Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const safeName = (value) =>
  String(value || 'Employee')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '_') || 'Employee';

const drawCell = (doc, x, y, w, h, text, opts = {}) => {
  const {
    bold = false,
    align = 'left',
    fontSize = 9,
    color = BLACK,
    label = null,
    value = null,
  } = opts;
  doc.rect(x, y, w, h).stroke(BLACK);
  doc.fillColor(color).fontSize(fontSize);
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
  const padX = 4;
  const padY = 5;
  if (label != null) {
    doc.font('Helvetica-Bold').text(`${label} `, x + padX, y + padY, {
      continued: true,
      width: w - padX * 2,
      height: h - padY,
      lineBreak: false,
    });
    doc.font('Helvetica').text(displayDash(value), {
      width: w - padX * 2,
      height: h - padY,
      lineBreak: false,
    });
  } else {
    doc.text(displayDash(text), x + padX, y + padY, {
      width: w - padX * 2,
      height: h - padY,
      align,
      lineBreak: false,
    });
  }
};

/**
 * Build PDF matching frontend PayslipTemplate layout.
 * @returns {Promise<{ buffer: Buffer, filename: string, viewModel: object }>}
 */
const buildPayslipPdf = (payslip, monthLabel = '') =>
  new Promise((resolve, reject) => {
    try {
      const vm = viewModelFromPayslip(payslip);
      if (!vm) {
        reject(new Error('Unable to build payslip view model'));
        return;
      }

      const label = monthLabel || vm.monthLabel || payslip?.month || '';
      const filename = `Payslip_${safeName(vm.name || 'Employee')}_${safeName(label)}.pdf`;

      const doc = new PDFDocument({ size: 'A4', margin: 36 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () =>
        resolve({ buffer: Buffer.concat(chunks), filename, viewModel: vm })
      );
      doc.on('error', reject);

      const pageW = doc.page.width - 72;
      const left = 36;
      let y = 36;
      const rowH = 18;

      // Header
      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(18);
      doc.text(vm.companyName || 'Urbancode Edutech Solutions Pvt Ltd', left, y, {
        width: pageW,
        align: 'center',
      });
      y = doc.y + 2;
      doc.fillColor(BLACK).font('Helvetica').fontSize(8);
      const cinGst = [
        vm.cin ? `CIN - ${vm.cin}` : '',
        vm.gstin ? `GSTIN - ${vm.gstin}` : '',
      ]
        .filter(Boolean)
        .join('  ||  ');
      doc.text(cinGst, left, y, { width: pageW, align: 'center' });
      y = doc.y + 8;

      const col3 = pageW / 3;

      // TAN / PF / ESI
      drawCell(doc, left, y, col3, rowH, '', { label: 'TAN :', value: vm.tan || '' });
      drawCell(doc, left + col3, y, col3, rowH, '', { label: 'PF :', value: vm.pfNumber || '' });
      drawCell(doc, left + col3 * 2, y, col3, rowH, '', {
        label: 'ESI :',
        value: vm.esiRegNumber || '',
      });
      y += rowH;

      // Pay period / Mobile
      drawCell(doc, left, y, col3 * 2, rowH, '', {
        label: 'Pay Period :',
        value: vm.payPeriodLabel || '',
      });
      drawCell(doc, left + col3 * 2, y, col3, rowH, '', {
        label: 'Mobile :',
        value: vm.mobile || '',
      });
      y += rowH;

      // Title
      drawCell(doc, left, y, pageW, 22, `Payslip for the Month Of ${vm.monthLabel || label}`, {
        bold: true,
        align: 'center',
        fontSize: 12,
      });
      y += 22;

      drawCell(doc, left, y, col3 * 2, rowH, '', {
        label: 'Payslip Reference :',
        value: vm.payslipReference || '',
      });
      drawCell(doc, left + col3 * 2, y, col3, rowH, '', {
        label: 'Generated On :',
        value: vm.generatedOn || '',
      });
      y += rowH;

      drawCell(doc, left, y, col3, rowH, '', { label: 'Name :', value: vm.name || '' });
      drawCell(doc, left + col3, y, col3, rowH, '', { label: 'Emp ID :', value: vm.empId || '' });
      drawCell(doc, left + col3 * 2, y, col3, rowH, '', {
        label: 'Emp Grade :',
        value: vm.empGrade || '',
      });
      y += rowH;

      drawCell(doc, left, y, col3, rowH, '', { label: 'Pan :', value: vm.pan || '' });
      drawCell(doc, left + col3, y, col3, rowH, '', { label: 'PF-UAN :', value: vm.uan || '' });
      drawCell(doc, left + col3 * 2, y, col3, rowH, '', { label: 'ESI :', value: vm.esi || '' });
      y += rowH;

      drawCell(doc, left, y, col3, rowH, '', { label: 'Bank :', value: vm.bankName || '' });
      drawCell(doc, left + col3, y, col3, rowH, '', {
        label: 'Bank Acc No :',
        value: vm.bankAccNo || '',
      });
      drawCell(doc, left + col3 * 2, y, col3, rowH, '', { label: 'IFSC :', value: vm.ifsc || '' });
      y += rowH;

      drawCell(doc, left, y, col3, rowH, '', {
        label: 'Days in Month :',
        value: vm.daysInMonth ?? '',
      });
      drawCell(doc, left + col3, y, col3, rowH, '', {
        label: 'LOP Days :',
        value: vm.lopDays ?? '',
      });
      drawCell(doc, left + col3 * 2, y, col3, rowH, '', {
        label: 'Paid Days :',
        value: vm.paidDays ?? '',
      });
      y += rowH;

      drawCell(doc, left, y, col3, rowH, '', { label: 'CTC :', value: vm.ctc ?? '' });
      drawCell(doc, left + col3, y, col3, rowH, '', {
        label: 'Gross Pay :',
        value: vm.grossPay ?? '',
      });
      drawCell(doc, left + col3 * 2, y, col3, rowH, '', {
        label: 'Paid Gross Pay :',
        value: vm.paidGrossPay ?? '',
      });
      y += rowH;

      drawCell(doc, left, y, col3 * 2, rowH, '', {
        label: 'Department :',
        value: vm.department || '',
      });
      drawCell(doc, left + col3 * 2, y, col3, rowH, '', {
        label: 'Designation :',
        value: vm.designation || '',
      });
      y += rowH;

      drawCell(doc, left, y, col3 * 2, rowH, '', {
        label: 'Joining Date :',
        value: vm.joiningDate || '',
      });
      drawCell(doc, left + col3 * 2, y, col3, rowH, '', {
        label: 'Working Location :',
        value: vm.workingLocation || '',
      });
      y += rowH;

      // spacer row
      doc.rect(left, y, pageW, 10).stroke(BLACK);
      y += 10;

      // Earnings / Deductions header
      const c1 = pageW * 0.3;
      const c2 = pageW * 0.2;
      const c3 = pageW * 0.3;
      const c4 = pageW * 0.2;

      drawCell(doc, left, y, c1, rowH, 'Earnings', {
        bold: true,
        color: GREEN,
        fontSize: 10,
      });
      drawCell(doc, left + c1, y, c2, rowH, 'Amount', {
        bold: true,
        color: GREEN,
        fontSize: 10,
      });
      drawCell(doc, left + c1 + c2, y, c3, rowH, 'Deduction', {
        bold: true,
        color: GREEN,
        fontSize: 10,
      });
      drawCell(doc, left + c1 + c2 + c3, y, c4, rowH, 'Amount', {
        bold: true,
        color: GREEN,
        fontSize: 10,
      });
      y += rowH;

      const earnings = vm.earnings || [];
      const deductions = vm.deductions || [];
      const rowCount = Math.max(earnings.length, deductions.length, 1);
      for (let i = 0; i < rowCount; i += 1) {
        drawCell(doc, left, y, c1, rowH, earnings[i]?.label || '');
        drawCell(
          doc,
          left + c1,
          y,
          c2,
          rowH,
          earnings[i] ? money(earnings[i].amount) : ''
        );
        drawCell(doc, left + c1 + c2, y, c3, rowH, deductions[i]?.label || '');
        drawCell(
          doc,
          left + c1 + c2 + c3,
          y,
          c4,
          rowH,
          deductions[i] ? money(deductions[i].amount) : ''
        );
        y += rowH;
      }

      drawCell(doc, left, y, c1, rowH, 'Total Earning(E)', {
        bold: true,
        align: 'right',
      });
      drawCell(doc, left + c1, y, c2, rowH, money(vm.totalEarnings), { bold: true });
      drawCell(doc, left + c1 + c2, y, c3, rowH, 'Total Deduction(D)', {
        bold: true,
        align: 'right',
      });
      drawCell(doc, left + c1 + c2 + c3, y, c4, rowH, money(vm.totalDeductions), {
        bold: true,
      });
      y += rowH;

      const wordsH = rowH * 2;
      doc.rect(left, y, c1 + c2, wordsH).stroke(BLACK);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9);
      doc.text('Net Pay-Amount in Words:', left + 4, y + 4, {
        width: c1 + c2 - 8,
      });
      doc.font('Helvetica').text(vm.netPayWords || '', left + 4, y + 16, {
        width: c1 + c2 - 8,
      });

      drawCell(doc, left + c1 + c2, y, c3 + c4, rowH, '', {
        label: 'Net Pay(E-D):',
        value: money(vm.netPay),
        bold: true,
      });
      drawCell(doc, left + c1 + c2, y + rowH, c3 + c4, rowH, '', {
        label: 'Remitted On:',
        value: vm.remittedOn || '',
      });
      y += wordsH + 14;

      doc.fillColor('#333333').font('Helvetica').fontSize(8);
      doc.text(
        'This is a computer generated payslip and does not require signature. For any discrepancies, please contact Management within 7 days.',
        left,
        y,
        { width: pageW, align: 'center' }
      );
      y = doc.y + 12;

      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(14);
      doc.text(vm.companyName || '', left, y, { width: pageW, align: 'center' });
      y = doc.y + 2;
      if (vm.address) {
        doc.fillColor(BLACK).font('Helvetica').fontSize(8);
        doc.text(vm.address, left, y, { width: pageW, align: 'center' });
        y = doc.y + 8;
      }

      const footerBits = [
        vm.email ? `Email : ${vm.email}` : '',
        vm.website ? `Website : ${vm.website}` : '',
        vm.phone ? `Ph no : ${vm.phone}` : '',
      ]
        .filter(Boolean)
        .join('  |  ');
      if (footerBits) {
        doc.rect(left, y, pageW, 18).fill(GREEN);
        doc.fillColor('#ffffff').font('Helvetica').fontSize(8);
        doc.text(footerBits, left, y + 5, { width: pageW, align: 'center' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });

module.exports = {
  buildPayslipPdf,
};
