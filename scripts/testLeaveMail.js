/**
 * Send a one-off TEST copy of the "New Leave Request Submitted" email.
 *
 * The HTML is extracted from controllers/leaveController.js at runtime,
 * so this always tests the exact template that applyLeave sends
 * (not a copy that could drift out of sync).
 *
 * Usage:
 *   node scripts/testLeaveMail.js you@example.com
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const transporter = require('../config/emailConfig');

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: node scripts/testLeaveMail.js you@example.com');
  process.exit(1);
}

function loadLeaveTemplate() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'leaveController.js'),
    'utf8'
  );
  const match = src.match(/subject:\s*'([^']+)'\s*,\s*html:\s*`([\s\S]*?)`\s*};/);
  if (!match) {
    throw new Error('Could not extract leave email template from leaveController.js');
  }
  const [, subject, htmlTemplate] = match;

  // Dummy data mirroring a real leave submission, for visual comparison.
  const user = {
    name: 'Test Employee',
    email: 'test.employee@example.com',
    position: 'Software Developer',
    company: 'Urbancode',
  };
  const fromDate = '2026-10-21';
  const toDate = '2026-10-21';
  const leaveType = 'Sick';
  const reason = 'Test mail - checking emoji / language rendering';

  const render = new Function(
    'user',
    'fromDate',
    'toDate',
    'leaveType',
    'reason',
    `return \`${htmlTemplate}\`;`
  );
  return { subject, html: render(user, fromDate, toDate, leaveType, reason) };
}

async function main() {
  if (typeof transporter.assertEmailConfigured === 'function') {
    transporter.assertEmailConfigured();
  }
  const from =
    typeof transporter.getSenderFromAddress === 'function'
      ? transporter.getSenderFromAddress()
      : `InOut Portal <${process.env.NOTIFY_EMAIL}>`;

  console.log('Verifying SMTP connection...');
  await transporter.verify();
  console.log('SMTP OK.');

  const { subject, html } = loadLeaveTemplate();

  if (/ð|â.|Â/.test(html) || /ð|â/.test(subject)) {
    throw new Error('Mojibake detected in rendered template - aborting send');
  }

  console.log(`Sending TEST leave mail to ${to} from ${from}...`);
  const result = await transporter.sendMail({
    from,
    to,
    subject: `[TEST] ${subject}`,
    html,
    text: [
      'New Leave Request Submitted',
      '',
      'Employee: Test Employee',
      'Email: test.employee@example.com',
      'Position: Software Developer - Urbancode',
      'Leave Dates: 10/21/2026 to 10/21/2026 (1 days)',
      'Leave Type: Sick',
      'Reason: Test mail - checking emoji / language rendering',
      '',
      'Action Required: Review this leave request in the Admin Panel: https://inout.urbancode.tech/',
    ].join('\n'),
  });
  console.log('Sent. messageId:', result.messageId || '(none)');
  console.log('Accepted:', result.accepted);
  if (result.rejected && result.rejected.length) {
    console.log('Rejected:', result.rejected);
  }
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
