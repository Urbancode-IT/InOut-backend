/**
 * Letter PDF upload / download helpers (Cloudinary).
 * PDFs should be uploaded as image + format=pdf (Cloudinary recommended).
 */

const LETTER_TYPE_LABELS = {
  offer: 'Offer Letter',
  experience: 'Experience Letter',
  relieving: 'Relieving Letter',
  'internship-offer': 'Internship Offer Letter',
  internship: 'Internship Certificate',
  uploaded: 'Uploaded Document',
};

const sanitizeFilename = (name) => {
  const base = String(name || 'letter')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return base || 'letter';
};

/**
 * Force browser download via Cloudinary fl_attachment.
 * Works for /image/upload/ and /raw/upload/ delivery URLs.
 */
const toDownloadUrl = (fileUrl, filename) => {
  const url = String(fileUrl || '').trim();
  if (!url) return '';
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return url;
  }
  if (url.includes('fl_attachment')) return url;

  const safe = sanitizeFilename(filename);
  return url.replace('/upload/', `/upload/fl_attachment:${safe}/`);
};

const ensurePdfFilename = (name) => {
  const raw = String(name || 'letter.pdf').trim() || 'letter.pdf';
  return /\.pdf$/i.test(raw) ? raw : `${raw}.pdf`;
};

const isGenericLetterLabel = (value) => {
  const v = String(value || '')
    .trim()
    .replace(/\.pdf$/i, '');
  return (
    !v ||
    /^file$/i.test(v) ||
    /^letter$/i.test(v) ||
    /^unknown([_\s-]?letter)?$/i.test(v) ||
    /^uploaded([_\s-]?document)?$/i.test(v)
  );
};

const titleCaseLetterLabel = (value) => {
  const raw = String(value || '')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!raw) return '';
  // Keep known all-caps titles readable: "OFFER LETTER" -> "Offer Letter"
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Infer letter type key from free text (title, filename, cloudinary url, etc).
 */
const inferLetterType = (...parts) => {
  const hay = parts
    .filter(Boolean)
    .map((p) => String(p).toLowerCase())
    .join(' ');
  if (!hay) return '';
  if (/internship[_\s-]*offer/.test(hay)) return 'internship-offer';
  if (/internship[_\s-]*(certificate|completion|letter)/.test(hay) || /certificate[_\s-]*of[_\s-]*internship/.test(hay)) {
    return 'internship';
  }
  if (/experience/.test(hay)) return 'experience';
  if (/relieving/.test(hay)) return 'relieving';
  if (/\boffer\b/.test(hay) || /offer[_\s-]*letter/.test(hay)) return 'offer';
  if (/uploaded/.test(hay)) return 'uploaded';
  return '';
};

/**
 * Resolve the human filename/label for admin table.
 * Prefer explicit letterType, then letter title, then inference from url/filename.
 */
const resolveLetterDisplayName = ({
  letterType,
  letterName,
  filename,
  url,
} = {}) => {
  const typeKey = String(letterType || '').trim().toLowerCase();
  if (typeKey && LETTER_TYPE_LABELS[typeKey]) {
    // If a custom title exists (e.g. EMPLOYMENT OFFER LETTER), prefer it
    const custom = String(letterName || '').trim().replace(/\.pdf$/i, '');
    if (custom && !isGenericLetterLabel(custom)) {
      return titleCaseLetterLabel(custom);
    }
    return LETTER_TYPE_LABELS[typeKey];
  }

  const candidates = [letterName, filename];
  for (const c of candidates) {
    const cleaned = String(c || '').trim().replace(/\.pdf$/i, '');
    if (!cleaned || isGenericLetterLabel(cleaned)) continue;
    const inferred = inferLetterType(cleaned);
    if (inferred && LETTER_TYPE_LABELS[inferred]) {
      // If text already looks like a letter title, pretty-print it
      if (/letter|certificate|document/i.test(cleaned)) {
        return titleCaseLetterLabel(cleaned);
      }
      return LETTER_TYPE_LABELS[inferred];
    }
    if (/letter|certificate|document/i.test(cleaned)) {
      return titleCaseLetterLabel(cleaned);
    }
  }

  const inferredFromUrl = inferLetterType(url, letterName, filename);
  if (inferredFromUrl && LETTER_TYPE_LABELS[inferredFromUrl]) {
    return LETTER_TYPE_LABELS[inferredFromUrl];
  }

  return '';
};

module.exports = {
  LETTER_TYPE_LABELS,
  sanitizeFilename,
  toDownloadUrl,
  ensurePdfFilename,
  isGenericLetterLabel,
  titleCaseLetterLabel,
  inferLetterType,
  resolveLetterDisplayName,
};
