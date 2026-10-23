const FRONTEND_BASE = 'https://inout.urbancode.tech';

const brandHeader = `
  <tr>
    <td style="background-color:#0b2d67;padding:20px 24px;border-radius:12px 12px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:Segoe UI,Arial,sans-serif;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.3px;">
            Urbancode
          </td>
          <td align="right" style="font-family:Segoe UI,Arial,sans-serif;color:#c7d7f5;font-size:12px;">
            InOut Attendance
          </td>
        </tr>
      </table>
    </td>
  </tr>
`;

const footer = `
  <tr>
    <td style="padding:20px 24px 8px 24px;border-top:1px solid #e5e7eb;">
      <p style="margin:0 0 8px 0;font-family:Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;text-align:center;">
        This is an automated email from<br/>
        <strong style="color:#374151;">Urbancode InOut Attendance System</strong><br/>
        Please do not reply to this email.
      </p>
      <p style="margin:0;font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#9ca3af;text-align:center;">
        &copy; Urbancode
      </p>
    </td>
  </tr>
`;

const wrapEmail = (title, bodyHtml) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
          ${brandHeader}
          <tr>
            <td style="padding:28px 24px 8px 24px;font-family:Segoe UI,Arial,sans-serif;color:#111827;">
              ${bodyHtml}
            </td>
          </tr>
          ${footer}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatMoney = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const statCard = (label, value) => `
  <td style="width:25%;padding:6px;">
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 8px;text-align:center;">
      <div style="font-size:18px;font-weight:700;color:#0b2d67;">${escapeHtml(value)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">${escapeHtml(label)}</div>
    </div>
  </td>
`;

const buildAttendanceSection = (attendance) => {
  const summary = attendance.summary || {};
  const days = Array.isArray(attendance.days) ? attendance.days : [];

  const dayRows = days
    .map((d) => {
      const statusColor =
        d.status === 'Present'
          ? '#166534'
          : d.status === 'Absent'
            ? '#b91c1c'
            : d.status === 'Half Day'
              ? '#b45309'
              : '#4b5563';
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;">${escapeHtml(d.dateLabel)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;">${escapeHtml(d.dayName)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;color:${statusColor};">${escapeHtml(d.status)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;">${escapeHtml(d.checkIn || '—')}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;">${escapeHtml(d.checkOut || '—')}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <h2 style="margin:24px 0 12px 0;font-size:17px;color:#0b2d67;">Attendance Summary</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
      <tr>
        ${statCard('Working', summary.workingDays ?? 0)}
        ${statCard('Present', summary.presentDays ?? 0)}
        ${statCard('Absent', summary.absentDays ?? 0)}
        ${statCard('Leave', summary.leaveDays ?? 0)}
      </tr>
      <tr>
        ${statCard('Late', summary.lateDays ?? 0)}
        ${statCard('Half Day', summary.halfDays ?? 0)}
        ${statCard('Total Days', summary.totalDays ?? 0)}
        ${statCard('Off / Holiday', summary.offDays ?? 0)}
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f8fafc;">
        <th align="left" style="padding:10px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Date</th>
        <th align="left" style="padding:10px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Day</th>
        <th align="left" style="padding:10px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Status</th>
        <th align="left" style="padding:10px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">In</th>
        <th align="left" style="padding:10px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Out</th>
      </tr>
      ${dayRows || `<tr><td colspan="5" style="padding:14px;font-size:13px;color:#6b7280;">No attendance rows for this month.</td></tr>`}
    </table>
  `;
};

const mapToRows = (mapLike) => {
  if (!mapLike) return [];
  if (mapLike instanceof Map) {
    return Array.from(mapLike.entries()).map(([label, amount]) => ({ label, amount }));
  }
  if (typeof mapLike === 'object') {
    return Object.entries(mapLike).map(([label, amount]) => ({ label, amount }));
  }
  return [];
};

const buildPayslipSection = (payslip) => {
  if (!payslip) {
    return `
      <h2 style="margin:28px 0 12px 0;font-size:17px;color:#0b2d67;">Payslip</h2>
      <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;">
        Payslip for this month has not been generated yet by HR. Your attendance summary is included above. You will receive the payslip separately once it is ready.
      </p>
    `;
  }

  const incomeRows = mapToRows(payslip.incomes);
  const deductionRows = mapToRows(payslip.deductions);

  const lineRows = (rows) =>
    rows
      .map(
        (r) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;">${escapeHtml(r.label)}</td>
        <td align="right" style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;">${formatMoney(r.amount)}</td>
      </tr>`
      )
      .join('');

  const emp = payslip.employeeDetails || {};
  const autoNote =
    payslip.viewModelSnapshot?.autoGenerated
      ? `<p style="margin:0 0 12px 0;font-size:12px;color:#6b7280;">Auto-generated from attendance (PF &amp; TDS = ₹0).</p>`
      : '';

  const statutoryBits = [
    emp.pan ? `PAN: ${emp.pan}` : '',
    emp.uan ? `UAN: ${emp.uan}` : '',
    emp.esiNumber ? `ESI: ${emp.esiNumber}` : '',
    emp.empGrade ? `Grade: ${emp.empGrade}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <h2 style="margin:28px 0 12px 0;font-size:17px;color:#0b2d67;">Payslip</h2>
    <p style="margin:0 0 4px 0;font-size:13px;color:#6b7280;">
      ${escapeHtml(emp.name || '')}${emp.designation ? ` · ${escapeHtml(emp.designation)}` : ''}${emp.department ? ` · ${escapeHtml(emp.department)}` : ''}
    </p>
    ${statutoryBits ? `<p style="margin:0 0 8px 0;font-size:12px;color:#9ca3af;">${escapeHtml(statutoryBits)}</p>` : ''}
    ${autoNote}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="width:50%;vertical-align:top;padding-right:8px;">
          <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <div style="background:#f8fafc;padding:10px;font-size:13px;font-weight:600;color:#0b2d67;border-bottom:1px solid #e5e7eb;">Earnings</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${lineRows(incomeRows) || `<tr><td style="padding:10px;font-size:13px;color:#6b7280;">No earnings listed</td></tr>`}
              <tr>
                <td style="padding:10px;font-size:13px;font-weight:700;color:#111827;">Total</td>
                <td align="right" style="padding:10px;font-size:13px;font-weight:700;color:#111827;">${formatMoney(payslip.totalIncome)}</td>
              </tr>
            </table>
          </div>
        </td>
        <td style="width:50%;vertical-align:top;padding-left:8px;">
          <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <div style="background:#f8fafc;padding:10px;font-size:13px;font-weight:600;color:#0b2d67;border-bottom:1px solid #e5e7eb;">Deductions</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${lineRows(deductionRows) || `<tr><td style="padding:10px;font-size:13px;color:#6b7280;">No deductions listed</td></tr>`}
              <tr>
                <td style="padding:10px;font-size:13px;font-weight:700;color:#111827;">Total</td>
                <td align="right" style="padding:10px;font-size:13px;font-weight:700;color:#111827;">${formatMoney(payslip.totalDeductions)}</td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
    </table>
    <div style="background:#0b2d67;border-radius:8px;padding:14px 16px;color:#ffffff;">
      <div style="font-size:12px;opacity:0.85;">Net Pay</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;">${formatMoney(payslip.netPay)}</div>
    </div>
  `;
};

/**
 * Attendance-only monthly digest (payslip is sent separately on the 4th).
 * @param {{ name: string, monthLabel: string, attendance: object, payslip?: object|null }} data
 */
const buildMonthlyReportHtml = ({ name, monthLabel, attendance }) => {
  const title = `Monthly Attendance Report — ${monthLabel}`;
  return wrapEmail(
    title,
    `
      <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#0b2d67;">
        ${escapeHtml(title)}
      </h1>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#374151;">
        Dear ${escapeHtml(name || 'Team Member')},
      </p>
      <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#374151;">
        Please find your attendance summary for <strong>${escapeHtml(monthLabel)}</strong> below.
        Your payslip (if applicable) is sent separately around the 4th of the month.
      </p>
      ${buildAttendanceSection(attendance)}
      <p style="margin:28px 0 0 0;font-size:15px;line-height:1.6;color:#374151;">
        Regards,<br/>
        <strong>HR Team</strong><br/>
        Urbancode
      </p>
      <p style="margin:16px 0 0 0;font-size:12px;color:#9ca3af;">
        Portal: <a href="${FRONTEND_BASE}" style="color:#0b2d67;">${FRONTEND_BASE}</a>
      </p>
    `
  );
};

module.exports = {
  FRONTEND_BASE,
  buildMonthlyReportHtml,
  escapeHtml,
  formatMoney,
};
