// -----------------------------------------------------------------------------
// Recipients: what users type, what Brevo expects, what the logs show.
//
// Phone numbers: Brevo takes the recipient of an SMS with its country code,
// 6 to 15 digits, optionally prefixed with '+'. Users type numbers the way
// they write them: "06 12 34 56 78", "+33 (0)6 12-34-56-78",
// "0033.6.12.34.56.78". A national number (one leading 0) gets the default
// country code of the configuration.
//
// Email addresses: a light check (one @, a dot in the domain, no space);
// Brevo has the last word and answers invalid_parameter otherwise.
//
// Both are masked in the logs and in the scene events: enough to tell two
// recipients apart, not enough to write to them.
// -----------------------------------------------------------------------------

const MIN_DIGITS = 6;
const MAX_DIGITS = 15; // E.164
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]{2,}$/;

/**
 * @description Turn a typed phone number into the international format.
 * @param {string} raw - The number as typed.
 * @param {string} [countryCode] - Default country code for a national number, digits only (e.g. '33').
 * @returns {string|null} '+33612345678', or null when it is not a phone number.
 * @example
 * normalizePhone('06 12 34 56 78', '33'); // -> '+33612345678'
 */
function normalizePhone(raw, countryCode = '33') {
  if (typeof raw !== 'string') {
    return null;
  }
  // "+33 (0)6…": the trunk 0 between parentheses is not dialed from abroad.
  const text = raw.trim().replace(/\(0\)/g, '');
  if (!/^\+?[\d\s.\-()/]+$/.test(text)) {
    return null;
  }
  const international = text.startsWith('+') || text.startsWith('00');
  let digits = text.replace(/\D/g, '');
  if (text.startsWith('00')) {
    digits = digits.slice(2);
  } else if (!international) {
    if (!digits.startsWith('0')) {
      return null;
    }
    const code = String(countryCode ?? '').replace(/\D/g, '');
    if (!code) {
      return null;
    }
    digits = `${code}${digits.slice(1)}`;
  }
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS || digits.startsWith('0')) {
    return null;
  }
  return `+${digits}`;
}

/**
 * @description Check and normalize an email address (trimmed, domain in
 * lower case).
 * @param {string} raw - The address as typed.
 * @returns {string|null} The address, or null when it does not look like one.
 * @example
 * normalizeEmail(' Alice@Example.COM '); // -> 'Alice@example.com'
 */
function normalizeEmail(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (text.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(text)) {
    return null;
  }
  const at = text.lastIndexOf('@');
  return `${text.slice(0, at)}@${text.slice(at + 1).toLowerCase()}`;
}

/**
 * @description Split a list typed in one field (comma, semicolon or line break
 * between the entries) and normalize each entry.
 * @param {string} raw - The list as typed.
 * @param {Function} normalize - `(entry) => string|null`.
 * @returns {{ valid: string[], invalid: string[] }} The entries, without duplicates.
 */
function parseList(raw, normalize) {
  const valid = [];
  const invalid = [];
  String(raw ?? '')
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const value = normalize(part);
      if (value === null) {
        invalid.push(part);
      } else if (!valid.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
        valid.push(value);
      }
    });
  return { valid, invalid };
}

/**
 * @description Split a list of phone numbers typed in one field.
 * @param {string} raw - The list as typed.
 * @param {string} [countryCode] - Default country code.
 * @returns {{ valid: string[], invalid: string[] }} The numbers.
 * @example
 * parsePhoneList('06 12 34 56 78, +32470123456', '33');
 * // -> { valid: ['+33612345678', '+32470123456'], invalid: [] }
 */
const parsePhoneList = (raw, countryCode) =>
  parseList(raw, (part) => normalizePhone(part, countryCode));

/**
 * @description Split a list of email addresses typed in one field.
 * @param {string} raw - The list as typed.
 * @returns {{ valid: string[], invalid: string[] }} The addresses.
 * @example
 * parseEmailList('alice@example.com; bob@example.org');
 */
const parseEmailList = (raw) => parseList(raw, normalizeEmail);

/**
 * @description Mask a phone number.
 * @param {string} phone - The number.
 * @returns {string} The masked number.
 * @example
 * maskPhone('+33612345678'); // -> '+336******78'
 */
function maskPhone(phone) {
  const text = String(phone ?? '');
  if (text.length <= 6) {
    return '****';
  }
  return `${text.slice(0, 4)}${'*'.repeat(text.length - 6)}${text.slice(-2)}`;
}

/**
 * @description Mask an email address: the first letter of the local part and
 * the domain stay.
 * @param {string} email - The address.
 * @returns {string} The masked address.
 * @example
 * maskEmail('alice@example.com'); // -> 'a***@example.com'
 */
function maskEmail(email) {
  const text = String(email ?? '');
  const at = text.lastIndexOf('@');
  if (at < 1) {
    return '***';
  }
  return `${text[0]}***${text.slice(at)}`;
}

/**
 * @description Mask a recipient of either kind.
 * @param {string} recipient - An email address or a phone number.
 * @returns {string} The masked recipient.
 * @example
 * maskRecipient('alice@example.com'); // -> 'a***@example.com'
 */
const maskRecipient = (recipient) =>
  String(recipient ?? '').includes('@') ? maskEmail(recipient) : maskPhone(recipient);

export {
  normalizePhone,
  normalizeEmail,
  parsePhoneList,
  parseEmailList,
  maskPhone,
  maskEmail,
  maskRecipient,
};
