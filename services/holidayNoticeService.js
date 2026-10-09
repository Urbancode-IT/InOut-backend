const https = require('https');
const Holiday = require('../models/Holiday');

const TIMEZONE = 'Asia/Kolkata';

/**
 * Get tomorrow's date in IST as a { year, month, day } object.
 */
const getTomorrowIST = (now = new Date()) => {
  // Add 1 day to current time
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(tomorrow);

  return {
    year: Number(parts.find((p) => p.type === 'year').value),
    month: Number(parts.find((p) => p.type === 'month').value),
    day: Number(parts.find((p) => p.type === 'day').value),
  };
};

/**
 * Format a date like "Saturday, October 11, 2026"
 */
const formatHolidayDate = (date) => {
  return new Date(date).toLocaleDateString('en-IN', {
    timeZone: TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Send a Google Chat webhook message via HTTPS POST.
 */
const sendWebhookMessage = (webhookUrl, text) => {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ text });
    const url = new URL(webhookUrl);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
        } else {
          reject(new Error(`Webhook responded with status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

/**
 * Main function: Check if tomorrow is a holiday and post notice to Google Chat.
 * Returns a report object.
 */
const runHolidayNotice = async () => {
  const webhookUrl = process.env.HOLIDAY_NOTICE_WEBHOOK_URL;
  if (!webhookUrl) {
    return { skippedReason: 'HOLIDAY_NOTICE_WEBHOOK_URL not set' };
  }

  const tomorrow = getTomorrowIST();
  // Build start and end of tomorrow in UTC for MongoDB query
  const startUTC = new Date(Date.UTC(tomorrow.year, tomorrow.month - 1, tomorrow.day, 0, 0, 0));
  const endUTC = new Date(Date.UTC(tomorrow.year, tomorrow.month - 1, tomorrow.day, 23, 59, 59, 999));

  // Find a holiday that falls on tomorrow
  const holiday = await Holiday.findOne({
    date: { $gte: startUTC, $lte: endUTC },
  });

  if (!holiday) {
    return {
      skippedReason: 'no_holiday_tomorrow',
      tomorrowDate: `${tomorrow.year}-${String(tomorrow.month).padStart(2,'0')}-${String(tomorrow.day).padStart(2,'0')}`,
    };
  }

  // Build the formatted date string
  const formattedDate = formatHolidayDate(holiday.date);

  // Build the message text
  const message =
    `Hi everyone, @all\n\n` +
    `*Holiday Notice 📢*\n\n` +
    `Please be informed that tomorrow, *${formattedDate}*, will be a holiday on account of *${holiday.name}*.\n\n` +
    `Please plan your work accordingly.\n\n` +
    `Wishing you all a wonderful holiday! ✨`;

  await sendWebhookMessage(webhookUrl, message);

  return {
    sent: true,
    holidayName: holiday.name,
    holidayDate: formattedDate,
  };
};

module.exports = {
  TIMEZONE,
  runHolidayNotice,
};
