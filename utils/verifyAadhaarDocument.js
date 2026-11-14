/**
 * Heuristic Aadhaar document check via OCR / PDF text.
 * Not a UIDAI eKYC proof — blocks obvious non-Aadhaar uploads.
 */

const AADHAAR_KEYWORD_PATTERNS = [
  /aadhaar/i,
  /aadhar/i,
  /uidai/i,
  /unique\s*identification/i,
  /government\s+of\s+india/i,
  /govt\.?\s+of\s+india/i,
  /भारत\s*सरकार/,
  /आधार/,
  /enrolment/i,
  /enrollment/i,
  /vid\b/i,
];

const AADHAAR_NUMBER_RE = /\b(\d{4})\s?[-\s]?(\d{4})\s?[-\s]?(\d{4})\b/g;

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function analyzeAadhaarText(rawText, expectedAadhaarNumber) {
  const text = String(rawText || '');
  const compact = text.replace(/\s+/g, ' ').trim();
  const digitBlob = normalizeDigits(text);

  const matchedKeywords = AADHAAR_KEYWORD_PATTERNS
    .filter((re) => re.test(compact))
    .map((re) => re.source);

  const foundNumbers = [];
  let match;
  const numberRe = new RegExp(AADHAAR_NUMBER_RE.source, 'g');
  while ((match = numberRe.exec(compact)) !== null) {
    foundNumbers.push(`${match[1]}${match[2]}${match[3]}`);
  }

  // OCR often drops spaces — also scan consecutive 12-digit runs
  const looseMatches = digitBlob.match(/\d{12}/g) || [];
  for (const n of looseMatches) {
    if (!foundNumbers.includes(n)) foundNumbers.push(n);
  }

  let score = 0;
  if (matchedKeywords.length >= 1) score += 2;
  if (matchedKeywords.length >= 2) score += 1;
  if (foundNumbers.length >= 1) score += 2;

  const expected = normalizeDigits(expectedAadhaarNumber);
  let numberMatchesProfile = false;
  if (expected.length === 12) {
    numberMatchesProfile =
      foundNumbers.includes(expected) || digitBlob.includes(expected);
    if (numberMatchesProfile) score += 3;
  }

  // Pass if we see Aadhaar markers + a 12-digit UID-style number,
  // or a strong match against the profile Aadhaar number.
  const ok =
    (matchedKeywords.length >= 1 && foundNumbers.length >= 1) ||
    numberMatchesProfile ||
    score >= 4;

  return {
    ok,
    score,
    matchedKeywords,
    foundNumbers: foundNumbers.slice(0, 5),
    numberMatchesProfile,
  };
}

async function extractTextFromImage(buffer) {
  const Tesseract = require('tesseract.js');
  const result = await Tesseract.recognize(buffer, 'eng', {
    logger: () => {},
  });
  return result?.data?.text || '';
}

async function extractTextFromPdf(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result?.text || '';
  } finally {
    if (typeof parser.destroy === 'function') {
      await parser.destroy();
    }
  }
}

/**
 * @param {{ buffer: Buffer, mimetype?: string, originalname?: string }} file
 * @param {{ expectedAadhaarNumber?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, message?: string, details?: object }>}
 */
async function verifyAadhaarDocument(file, options = {}) {
  const buffer = file?.buffer;
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { ok: false, message: 'No file data to verify.' };
  }

  const mime = (file.mimetype || '').toLowerCase();
  const name = (file.originalname || '').toLowerCase();
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
  const isImage =
    mime.startsWith('image/') ||
    /\.(jpe?g|png)$/i.test(name);

  if (!isPdf && !isImage) {
    return {
      ok: false,
      message: 'Only JPG, PNG or PDF Aadhaar card files are allowed.',
    };
  }

  const timeoutMs = options.timeoutMs || 45000;
  const withTimeout = (promise) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Aadhaar verification timed out')), timeoutMs)
      ),
    ]);

  let text = '';
  try {
    if (isPdf) {
      text = await withTimeout(extractTextFromPdf(buffer));
      // Scanned PDF often has little/no text — ask for a clear photo instead
      if (!String(text).trim() || String(text).trim().length < 20) {
        return {
          ok: false,
          message:
            'Could not read text from this PDF. Please upload a clear JPG/PNG photo of your Aadhaar card (front side).',
        };
      }
    } else {
      text = await withTimeout(extractTextFromImage(buffer));
    }
  } catch (err) {
    console.error('Aadhaar OCR/verify failed:', err?.message || err);
    return {
      ok: false,
      message:
        'Could not verify the document. Please upload a clear, readable photo of your Aadhaar card.',
    };
  }

  const details = analyzeAadhaarText(text, options.expectedAadhaarNumber);
  if (!details.ok) {
    return {
      ok: false,
      message:
        'This does not look like an Aadhaar card. Please upload a clear photo/scan of your Aadhaar card only (not PAN, driving licence, or other documents).',
      details,
    };
  }

  return { ok: true, details };
}

module.exports = {
  verifyAadhaarDocument,
  analyzeAadhaarText,
};
