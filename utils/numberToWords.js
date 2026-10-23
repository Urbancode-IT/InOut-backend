const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
}

function threeDigits(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundreds) return twoDigits(rest);
  return `${ONES[hundreds]} Hundred${rest ? ` ${twoDigits(rest)}` : ''}`;
}

function numberToWordsIndian(value) {
  let num = Math.floor(value);
  if (num === 0) return 'Zero';

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = num;

  const parts = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(' ');
}

const rupeesInWords = (amount) => {
  const abs = Math.abs(Number(amount) || 0);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);

  let words = `Rupees ${numberToWordsIndian(rupees)}`;
  if (paise) words += ` and ${numberToWordsIndian(paise)} Paise`;
  return `${words} Only`;
};

module.exports = {
  rupeesInWords,
  numberToWordsIndian,
};
