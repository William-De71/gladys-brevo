// -----------------------------------------------------------------------------
// Configuration of the Brevo integration.
//
// Two levels, as the manifest declares them:
//   - `config_schema` (the administrator, once for the house): the API key, the
//     email sender and the subject prefix, the SMS sender and the default
//     country code, the low SMS credits threshold, the delivery follow-up;
//   - `contact_schema` (each user, in the "My account" block): the channel
//     their notifications take (email, SMS or both), their email address and
//     their mobile number. Gladys hands these values with every message.
// -----------------------------------------------------------------------------

import { normalizeEmail, normalizePhone } from './recipients.js';
import { CHANNELS } from './brevo.js';

const DEFAULT_COUNTRY_CODE = '33';
const DEFAULT_LOW_CREDITS = 20;
const DEFAULT_SENDER_NAME = 'Gladys';
const DEFAULT_SUBJECT_PREFIX = 'Gladys';
const DEFAULT_SMS_SENDER = 'Gladys';

// Values of the `channel` select of the contact_schema. Stored per user:
// never rename one.
const CONTACT_CHANNELS = Object.freeze({ EMAIL: 'email', SMS: 'sms', BOTH: 'both' });

/**
 * @description A trimmed string, '' for anything else.
 * @param {any} value - The raw value.
 * @returns {string} The string.
 */
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @description A boolean from the configuration (true, 'true'), or the default.
 * @param {any} value - The raw value.
 * @param {boolean} fallback - The default.
 * @returns {boolean} The boolean.
 */
function flag(value, fallback) {
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return fallback;
}

/**
 * @description Normalize the integration configuration.
 * @param {object} [raw] - The raw values (gladys.config).
 * @returns {object} The configuration used by the integration.
 * @example
 * normalizeConfig({ api_key: 'xkeysib-…' });
 */
function normalizeConfig(raw = {}) {
  const threshold = Number(raw.low_credits_threshold);
  return {
    apiKey: text(raw.api_key),
    // A typed address that is not one is kept as typed: Brevo's refusal then
    // names the problem (invalid_sender) instead of a silent fallback.
    senderEmail: normalizeEmail(text(raw.sender_email)) ?? text(raw.sender_email),
    senderName: text(raw.sender_name).slice(0, 70) || DEFAULT_SENDER_NAME,
    subjectPrefix: text(raw.subject_prefix).slice(0, 60) || DEFAULT_SUBJECT_PREFIX,
    // Spaces are not allowed in an SMS sender: "My Home" becomes "MyHome".
    smsSender: text(raw.sms_sender).replace(/\s+/g, '') || DEFAULT_SMS_SENDER,
    countryCode: text(raw.country_code).replace(/\D/g, '') || DEFAULT_COUNTRY_CODE,
    lowCreditsThreshold:
      raw.low_credits_threshold === undefined ||
      raw.low_credits_threshold === null ||
      raw.low_credits_threshold === '' ||
      !Number.isFinite(threshold)
        ? DEFAULT_LOW_CREDITS
        : Math.max(0, threshold),
    followDeliveries: flag(raw.follow_deliveries, true),
  };
}

/**
 * @description Whether the API key is set.
 * @param {object} config - normalizeConfig.
 * @returns {boolean} True when the integration can call Brevo.
 * @example
 * hasCredentials(normalizeConfig({})); // -> false
 */
const hasCredentials = (config) => Boolean(config.apiKey);

/**
 * @description Where the notifications of a user go, from the values of their
 * "My account" block.
 * @param {object} [contact] - The contact_schema values.
 * @param {string} countryCode - Default country code.
 * @returns {Array<{ channel: string, recipient: string|null, typed: string }>}
 *   One entry per channel; `recipient` is null when the typed value is not
 *   usable (missing or invalid).
 * @example
 * contactTargets({ channel: 'both', email: 'a@b.fr', phone_number: '0612345678' }, '33');
 */
function contactTargets(contact = {}, countryCode = DEFAULT_COUNTRY_CODE) {
  const channel = Object.values(CONTACT_CHANNELS).includes(contact?.channel)
    ? contact.channel
    : CONTACT_CHANNELS.EMAIL;
  const targets = [];
  if (channel !== CONTACT_CHANNELS.SMS) {
    const typed = text(contact?.email);
    targets.push({ channel: CHANNELS.EMAIL, recipient: normalizeEmail(typed), typed });
  }
  if (channel !== CONTACT_CHANNELS.EMAIL) {
    const typed = text(contact?.phone_number);
    targets.push({ channel: CHANNELS.SMS, recipient: normalizePhone(typed, countryCode), typed });
  }
  return targets;
}

export {
  normalizeConfig,
  hasCredentials,
  contactTargets,
  CONTACT_CHANNELS,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_LOW_CREDITS,
  DEFAULT_SMS_SENDER,
};
