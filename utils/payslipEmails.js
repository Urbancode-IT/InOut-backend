const { viewModelFromPayslip, displayDash } = require('./payslipViewModel');

const FRONTEND_BASE = 'https://inout.urbancode.tech';
const GREEN = '#149c63';
const BORDER = '1px solid #1a1a1a';

const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatMoney = (amount) =>
  Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const cell = (content, extra = '', attrs = '') =>
  `<td ${attrs} style="border:${BORDER};padding:8px 12px;font-size:13px;color:#1a1a1a;vertical-align:middle;${extra}">${content}</td>`;

const labelCell = (label, value, extra = '', attrs = '') =>
  cell(
    `<strong>${escapeHtml(label)}</strong> ${escapeHtml(displayDash(value))}`,
    extra,
    attrs
  );

/**
 * Payslip email — same layout as frontend PayslipTemplate + PDF download note.
 */
const buildPayslipOnlyHtml = ({ name, monthLabel, payslip }) => {
  const vm = viewModelFromPayslip(payslip);
  if (!vm) {
    return `<p>Payslip unavailable.</p>`;
  }

  const earnings = vm.earnings || [];
  const deductions = vm.deductions || [];
  const rowCount = Math.max(earnings.length, deductions.length, 1);

  const earningRows = Array.from({ length: rowCount })
    .map((_, i) => {
      const e = earnings[i];
      const d = deductions[i];
      return `<tr>
        ${cell(escapeHtml(e?.label || ''))}
        ${cell(e ? formatMoney(e.amount) : '')}
        ${cell(escapeHtml(d?.label || ''))}
        ${cell(d ? formatMoney(d.amount) : '')}
      </tr>`;
    })
    .join('');

  const title = `Payslip — ${vm.monthLabel || monthLabel}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:20px 10px;">
    <tr>
      <td align="center">
        <div style="max-width:780px;margin:0 auto 14px auto;padding:12px 16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;text-align:left;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:14px;font-weight:700;color:#065f46;">Download Payslip (PDF)</div>
          <div style="font-size:13px;color:#047857;margin-top:4px;">Your payslip PDF is attached to this email. Open the attachment to view or download and save it.</div>
        </div>

        <div style="width:100%;max-width:760px;background:#fff;font-family:Arial,Helvetica,sans-serif;padding:24px;box-sizing:border-box;color:#1a1a1a;border:1px solid #e5e7eb;">
          <div style="text-align:center;">
            <h1 style="color:${GREEN};font-size:26px;margin:0;font-weight:800;">${escapeHtml(vm.companyName)}</h1>
            <div style="font-size:11px;margin-top:4px;margin-bottom:14px;">
              ${vm.cin ? `CIN - ${escapeHtml(vm.cin)}` : ''}
              ${vm.cin && vm.gstin ? ' || ' : ''}
              ${vm.gstin ? `GSTIN - ${escapeHtml(vm.gstin)}` : ''}
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;border:${BORDER};">
            <tr>
              ${labelCell('TAN :', vm.tan)}
              ${labelCell('PF :', vm.pfNumber)}
              ${labelCell('ESI :', vm.esiRegNumber)}
            </tr>
            <tr>
              ${labelCell('Pay Period :', vm.payPeriodLabel, '', 'colspan="2"')}
              ${labelCell('Mobile :', vm.mobile)}
            </tr>
            <tr>
              ${cell(
                `<strong style="font-size:16px;">Payslip for the Month Of ${escapeHtml(vm.monthLabel || monthLabel)}</strong>`,
                'text-align:center;',
                'colspan="3"'
              )}
            </tr>
            <tr>
              ${labelCell('Payslip Reference :', vm.payslipReference, '', 'colspan="2"')}
              ${labelCell('Generated On :', vm.generatedOn)}
            </tr>
            <tr>
              ${labelCell('Name :', vm.name)}
              ${labelCell('Emp ID :', vm.empId)}
              ${labelCell('Emp Grade :', vm.empGrade)}
            </tr>
            <tr>
              ${labelCell('Pan :', vm.pan)}
              ${labelCell('PF-UAN :', vm.uan)}
              ${labelCell('ESI :', vm.esi)}
            </tr>
            <tr>
              ${labelCell('Bank :', vm.bankName)}
              ${labelCell('Bank Acc No :', vm.bankAccNo)}
              ${labelCell('IFSC :', vm.ifsc)}
            </tr>
            <tr>
              ${labelCell('Days in Month :', vm.daysInMonth)}
              ${labelCell('LOP Days :', vm.lopDays)}
              ${labelCell('Paid Days :', vm.paidDays)}
            </tr>
            <tr>
              ${labelCell('CTC :', vm.ctc)}
              ${labelCell('Gross Pay :', vm.grossPay)}
              ${labelCell('Paid Gross Pay :', vm.paidGrossPay)}
            </tr>
            <tr>
              ${labelCell('Department :', vm.department, '', 'colspan="2"')}
              ${labelCell('Designation :', vm.designation)}
            </tr>
            <tr>
              ${labelCell('Joining Date :', vm.joiningDate, '', 'colspan="2"')}
              ${labelCell('Working Location :', vm.workingLocation)}
            </tr>
            <tr><td colspan="3" style="border:${BORDER};height:18px;">&nbsp;</td></tr>
          </table>

          <table style="width:100%;border-collapse:collapse;border:${BORDER};border-top:none;margin-top:-1px;">
            <tr>
              ${cell(`<span style="color:${GREEN};font-weight:700;">Earnings</span>`, 'width:30%;')}
              ${cell(`<span style="color:${GREEN};font-weight:700;">Amount</span>`, 'width:20%;')}
              ${cell(`<span style="color:${GREEN};font-weight:700;">Deduction</span>`, 'width:30%;')}
              ${cell(`<span style="color:${GREEN};font-weight:700;">Amount</span>`, 'width:20%;')}
            </tr>
            ${earningRows}
            <tr>
              ${cell('<strong>Total Earning(E)</strong>', 'text-align:right;')}
              ${cell(`<strong>${formatMoney(vm.totalEarnings)}</strong>`)}
              ${cell('<strong>Total Deduction(D)</strong>', 'text-align:right;')}
              ${cell(`<strong>${formatMoney(vm.totalDeductions)}</strong>`)}
            </tr>
            <tr>
              <td colspan="2" rowspan="2" style="border:${BORDER};padding:8px 12px;font-size:13px;">
                <div style="font-weight:600;">Net Pay-Amount in Words:</div>
                <div style="margin-top:4px;">${escapeHtml(displayDash(vm.netPayWords))}</div>
              </td>
              ${labelCell('Net Pay(E-D):', formatMoney(vm.netPay), 'font-weight:700;', 'colspan="2"')}
            </tr>
            <tr>
              ${labelCell('Remitted On:', vm.remittedOn, '', 'colspan="2"')}
            </tr>
          </table>

          <div style="text-align:center;font-size:10.5px;margin-top:18px;color:#333;">
            This is a computer generated payslip and does not require signature. For any discrepancies,<br/>
            please contact Management within 7 days.
          </div>

          <div style="text-align:center;margin-top:22px;">
            <h2 style="color:${GREEN};margin:0;font-size:20px;font-weight:800;">${escapeHtml(vm.companyName)}</h2>
            ${vm.address ? `<div style="font-size:11px;margin-top:4px;">${escapeHtml(vm.address)}</div>` : ''}
          </div>

          <div style="background:${GREEN};color:#fff;text-align:center;padding:9px 0;margin-top:14px;font-size:11px;">
            ${vm.email ? `Email : ${escapeHtml(vm.email)}` : ''}
            ${vm.email && vm.website ? ' | ' : ''}
            ${vm.website ? `Website : ${escapeHtml(vm.website)}` : ''}
            ${(vm.email || vm.website) && vm.phone ? ' | ' : ''}
            ${vm.phone ? `Ph no : ${escapeHtml(vm.phone)}` : ''}
          </div>
        </div>

        <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9ca3af;margin-top:14px;">
          Portal: <a href="${FRONTEND_BASE}" style="color:${GREEN};">${FRONTEND_BASE}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

module.exports = {
  FRONTEND_BASE,
  buildPayslipOnlyHtml,
  escapeHtml,
  formatMoney,
};
