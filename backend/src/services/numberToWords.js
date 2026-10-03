// Converts a monetary amount into a full legal "amount in words" sentence,
// in both English and Arabic — the classic "One Hundred Eighty Kuwaiti
// Dinars Only" / "مائة وثمانون دينارا كويتيا فقط لا غير" line printed on
// invoices and cheques across the Gulf.
//
// Supports any currency via CURRENCIES below (falls back to a generic
// "Unit/Cent" pair for an unlisted code so this never throws). KWD is the
// app's default currency everywhere (3-decimal fils subunit), so it gets
// full native Arabic noun forms; the others follow the same pattern.

// Arabic noun agreement forms per count:
//   one   — count is exactly 1 (the number word itself is omitted)
//   two   — count is exactly 2 (dual; number word omitted)
//   few   — count is 3-10 (plural, e.g. "ثلاثة دنانير")
//   many  — count is 11-99 or has a non-round remainder (singular, accusative
//           tamyiz — written with a trailing alef, e.g. "عشرون دينارا")
//   bare  — count is an exact round hundred/thousand/million/billion with no
//           remainder (singular, genitive construct-state — no trailing
//           alef, e.g. "ألف دينار" not "ألف دينارا")
const CURRENCIES = {
  KWD: {
    decimals: 3,
    en: { majorSingular: 'Kuwaiti Dinar', majorPlural: 'Kuwaiti Dinars', minorSingular: 'Fils', minorPlural: 'Fils' },
    ar: {
      major: { one: 'دينار كويتي واحد', two: 'ديناران كويتيان', few: 'دنانير كويتية', many: 'دينارا كويتيا', bare: 'دينار كويتي' },
      minor: { one: 'فلس واحد', two: 'فلسان', few: 'فلوس', many: 'فلسا', bare: 'فلس' },
    },
  },
  SAR: {
    decimals: 2,
    en: { majorSingular: 'Saudi Riyal', majorPlural: 'Saudi Riyals', minorSingular: 'Halala', minorPlural: 'Halalas' },
    ar: {
      major: { one: 'ريال سعودي واحد', two: 'ريالان سعوديان', few: 'ريالات سعودية', many: 'ريالا سعوديا', bare: 'ريال سعودي' },
      minor: { one: 'هللة واحدة', two: 'هللتان', few: 'هللات', many: 'هللة', bare: 'هللة' },
    },
  },
  USD: {
    decimals: 2,
    en: { majorSingular: 'US Dollar', majorPlural: 'US Dollars', minorSingular: 'Cent', minorPlural: 'Cents' },
    ar: {
      major: { one: 'دولار أمريكي واحد', two: 'دولاران أمريكيان', few: 'دولارات أمريكية', many: 'دولارا أمريكيا', bare: 'دولار أمريكي' },
      minor: { one: 'سنت واحد', two: 'سنتان', few: 'سنتات', many: 'سنتا', bare: 'سنت' },
    },
  },
  EGP: {
    decimals: 2,
    en: { majorSingular: 'Egyptian Pound', majorPlural: 'Egyptian Pounds', minorSingular: 'Piastre', minorPlural: 'Piastres' },
    ar: {
      major: { one: 'جنيه مصري واحد', two: 'جنيهان مصريان', few: 'جنيهات مصرية', many: 'جنيها مصريا', bare: 'جنيه مصري' },
      minor: { one: 'قرش واحد', two: 'قرشان', few: 'قروش', many: 'قرشا', bare: 'قرش' },
    },
  },
  AED: {
    decimals: 2,
    en: { majorSingular: 'UAE Dirham', majorPlural: 'UAE Dirhams', minorSingular: 'Fils', minorPlural: 'Fils' },
    ar: {
      major: { one: 'درهم إماراتي واحد', two: 'درهمان إماراتيان', few: 'دراهم إماراتية', many: 'درهما إماراتيا', bare: 'درهم إماراتي' },
      minor: { one: 'فلس واحد', two: 'فلسان', few: 'فلوس', many: 'فلسا', bare: 'فلس' },
    },
  },
  DEFAULT: {
    decimals: 2,
    en: { majorSingular: 'Unit', majorPlural: 'Units', minorSingular: 'Cent', minorPlural: 'Cents' },
    ar: {
      major: { one: 'وحدة واحدة', two: 'وحدتان', few: 'وحدات', many: 'وحدة', bare: 'وحدة' },
      minor: { one: 'سنت واحد', two: 'سنتان', few: 'سنتات', many: 'سنتا', bare: 'سنت' },
    },
  },
};

// ---------------------------------------------------------------------------
// Arabic cardinal numbers (0 .. 999,999,999,999)
// ---------------------------------------------------------------------------
const AR_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const AR_TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const AR_HUNDREDS = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function arThreeDigits(num) {
  const h = Math.floor(num / 100);
  const rem = num % 100;
  const parts = [];
  if (h) parts.push(AR_HUNDREDS[h]);
  if (rem) {
    if (rem < 10) parts.push(AR_ONES[rem]);
    else if (rem < 20) parts.push(AR_TEENS[rem - 10]);
    else {
      const t = Math.floor(rem / 10);
      const o = rem % 10;
      parts.push(o ? `${AR_ONES[o]} و${AR_TENS[t]}` : AR_TENS[t]);
    }
  }
  return parts.join(' و');
}

// forms: [one, two, few(3-10), many(11+, also used standalone for 100/1000/etc.)]
function arScaleWord(n, forms) {
  if (n === 1) return forms[0];
  if (n === 2) return forms[1];
  if (n >= 3 && n <= 10) return forms[2];
  return forms[3];
}

function arScaleSegment(n, forms) {
  if (n <= 2) return arScaleWord(n, forms);
  return `${arThreeDigits(n)} ${arScaleWord(n, forms)}`;
}

function numberToArabicWords(num) {
  num = Math.round(num);
  if (num === 0) return 'صفر';
  const billions = Math.floor(num / 1e9);
  const millions = Math.floor((num % 1e9) / 1e6);
  const thousands = Math.floor((num % 1e6) / 1e3);
  const rest = num % 1000;

  const segments = [];
  if (billions) segments.push(arScaleSegment(billions, ['مليار', 'ملياران', 'مليارات', 'مليار']));
  if (millions) segments.push(arScaleSegment(millions, ['مليون', 'مليونان', 'ملايين', 'مليون']));
  if (thousands) segments.push(arScaleSegment(thousands, ['ألف', 'ألفان', 'آلاف', 'ألف']));
  if (rest) segments.push(arThreeDigits(rest));
  return segments.join(' و');
}

// Full "<number> <noun>" phrase with correct Arabic noun agreement — 1 and 2
// drop the number word entirely (the noun's own singular/dual form already
// says it), 3-10 take the plural noun, an exact round hundred/thousand/
// million/billion (no remainder) takes the bare genitive singular, and every
// other compound (11-99, or any amount with a non-round remainder — e.g.
// 1,234) takes the accusative singular ("تمييز") form.
function arAmountPhrase(n, nounForms) {
  if (n === 1) return nounForms.one;
  if (n === 2) return nounForms.two;
  if (n >= 3 && n <= 10) return `${numberToArabicWords(n)} ${nounForms.few}`;
  if (n % 100 === 0) return `${numberToArabicWords(n)} ${nounForms.bare}`;
  return `${numberToArabicWords(n)} ${nounForms.many}`;
}

// ---------------------------------------------------------------------------
// English cardinal numbers
// ---------------------------------------------------------------------------
const EN_ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function enThreeDigits(num) {
  const h = Math.floor(num / 100);
  const rem = num % 100;
  const parts = [];
  if (h) parts.push(`${EN_ONES[h]} Hundred`);
  if (rem) {
    if (rem < 20) parts.push(EN_ONES[rem]);
    else {
      const t = Math.floor(rem / 10);
      const o = rem % 10;
      parts.push(o ? `${EN_TENS[t]}-${EN_ONES[o]}` : EN_TENS[t]);
    }
  }
  return parts.join(' ');
}

function numberToEnglishWords(num) {
  num = Math.round(num);
  if (num === 0) return 'Zero';
  const billions = Math.floor(num / 1e9);
  const millions = Math.floor((num % 1e9) / 1e6);
  const thousands = Math.floor((num % 1e6) / 1e3);
  const rest = num % 1000;

  const segments = [];
  if (billions) segments.push(`${enThreeDigits(billions)} Billion`);
  if (millions) segments.push(`${enThreeDigits(millions)} Million`);
  if (thousands) segments.push(`${enThreeDigits(thousands)} Thousand`);
  if (rest) segments.push(enThreeDigits(rest));
  return segments.join(' ');
}

// ---------------------------------------------------------------------------
// Public: full "amount in words" sentences
// ---------------------------------------------------------------------------
function splitAmount(amount, decimals) {
  const whole = Math.floor(Number(amount) + 1e-6);
  const frac = Math.round((Number(amount) - whole) * Math.pow(10, decimals));
  return { whole, frac };
}

function amountInWordsEn(amount, currencyCode) {
  const cur = CURRENCIES[currencyCode] || CURRENCIES.DEFAULT;
  const { whole, frac } = splitAmount(amount, cur.decimals);
  const majorName = whole === 1 ? cur.en.majorSingular : cur.en.majorPlural;
  let sentence = `${numberToEnglishWords(whole)} ${majorName}`;
  if (frac > 0) {
    const minorName = frac === 1 ? cur.en.minorSingular : cur.en.minorPlural;
    sentence += ` and ${numberToEnglishWords(frac)} ${minorName}`;
  }
  return `${sentence} Only`;
}

function amountInWordsAr(amount, currencyCode) {
  const cur = CURRENCIES[currencyCode] || CURRENCIES.DEFAULT;
  const { whole, frac } = splitAmount(amount, cur.decimals);
  let sentence = arAmountPhrase(whole, cur.ar.major);
  if (frac > 0) sentence += ` و${arAmountPhrase(frac, cur.ar.minor)}`;
  return `${sentence} فقط لا غير`;
}

module.exports = { amountInWordsEn, amountInWordsAr, numberToEnglishWords, numberToArabicWords };
