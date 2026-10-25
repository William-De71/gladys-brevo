// -----------------------------------------------------------------------------
// The Brevo account, through the API (see brevo-api.js for the endpoints):
// read the plan and the credits, resolve the email sender, send emails and
// SMS, read the delivery events of what was sent.
//
// The email sender is resolved once, then kept until the configuration
// changes: the address of the configuration, or else the first active sender
// of the account (Brevo refuses an address that is not a verified sender or
// on an authenticated domain).
//
// Everything sent carries the tag "gladys": the user finds the messages of
// Gladys in the Brevo logs, and the delivery events are matched to the
// message ids the integration kept.
// -----------------------------------------------------------------------------

import { BrevoApiError, ERROR_KINDS } from './brevo-api.js';

// Why a message was not sent, as the `reason` of a BrevoError and of the
// `message_not_sent` scene trigger. Scenes store these values: never rename one.
const FAILURE_REASONS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  ACCESS_DENIED: 'access_denied',
  IP_NOT_AUTHORIZED: 'ip_not_authorized',
  ACCOUNT_RESTRICTED: 'account_restricted',
  NOT_ENOUGH_CREDITS: 'not_enough_credits',
  NO_SENDER: 'no_sender',
  INVALID_SENDER: 'invalid_sender',
  INVALID_RECIPIENT: 'invalid_recipient',
  REJECTED: 'rejected',
  RATE_LIMITED: 'rate_limited',
  SERVER_ERROR: 'server_error',
  TIMEOUT: 'timeout',
  UNREACHABLE: 'unreachable',
  UNEXPECTED: 'unexpected',
});

// Delivery statuses read from the events of Brevo, as the `event` of the
// `delivery_failed` scene trigger. Scenes store these values: never rename one.
const DELIVERY_FAILURES = Object.freeze({
  HARD_BOUNCE: 'hard_bounce',
  SOFT_BOUNCE: 'soft_bounce',
  BLOCKED: 'blocked',
  INVALID: 'invalid',
  SPAM: 'spam',
  ERROR: 'error',
  REJECTED: 'rejected',
  SKIPPED: 'skipped',
});
const DELIVERED = 'delivered';

const CHANNELS = Object.freeze({ EMAIL: 'email', SMS: 'sms' });
const TAG = 'gladys';

// A send Brevo refused with 429 was not accepted: a retry cannot deliver it
// twice. Never on a timeout or a 5xx: the message may have left, and a
// duplicate alert is worse than a reported failure.
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 10 * 1000;

const MAX_SUBJECT_LENGTH = 200;
const MAX_SMS_LENGTH = 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_EVENTS = 500;

// The GSM 03.38 alphabet (basic set and extension table): an SMS written only
// with these characters holds 160 characters a part, 70 otherwise (unicode).
const GSM_CHARACTERS = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€',
);

/**
 * @description A message that was not sent, with the reason.
 */
class BrevoError extends Error {
  /**
   * @param {string} message - Readable message, in English, without the API key.
   * @param {object} details - Details.
   * @param {string} details.reason - One of FAILURE_REASONS.
   * @param {number|null} [details.status] - HTTP status, when Brevo answered.
   * @param {Error} [details.cause] - Underlying error.
   */
  constructor(message, { reason, status = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'BrevoError';
    this.reason = reason;
    this.status = status;
  }
}

/**
 * @description The failure reason of a Brevo API error.
 * @param {Error} err - A BrevoApiError (or anything else).
 * @returns {string} One of FAILURE_REASONS.
 * @example
 * reasonOf(new BrevoApiError('x', { kind: 'rate_limited', status: 429 })); // -> 'rate_limited'
 */
function reasonOf(err) {
  if (err instanceof BrevoError) {
    return err.reason;
  }
  if (!(err instanceof BrevoApiError)) {
    return FAILURE_REASONS.UNEXPECTED;
  }
  const code = err.code ?? '';
  const message = err.brevoMessage ?? '';
  if (/not_enough_credits|insufficient credits/i.test(`${code} ${message}`)) {
    return FAILURE_REASONS.NOT_ENOUGH_CREDITS;
  }
  if (
    /permission_denied|account_under_validation|not activated|suspended/i.test(`${code} ${message}`)
  ) {
    return FAILURE_REASONS.ACCOUNT_RESTRICTED;
  }
  switch (err.kind) {
    case ERROR_KINDS.AUTH:
      return err.status === null ? FAILURE_REASONS.NOT_CONFIGURED : FAILURE_REASONS.ACCESS_DENIED;
    case ERROR_KINDS.IP_BLOCKED:
      return FAILURE_REASONS.IP_NOT_AUTHORIZED;
    case ERROR_KINDS.FORBIDDEN:
      return FAILURE_REASONS.ACCOUNT_RESTRICTED;
    case ERROR_KINDS.BAD_REQUEST:
    case ERROR_KINDS.NOT_FOUND:
      if (/sender/i.test(message)) {
        return FAILURE_REASONS.INVALID_SENDER;
      }
      if (/recipient|email|phone|number|mobile/i.test(message)) {
        return FAILURE_REASONS.INVALID_RECIPIENT;
      }
      return FAILURE_REASONS.REJECTED;
    case ERROR_KINDS.RATE_LIMITED:
      return FAILURE_REASONS.RATE_LIMITED;
    case ERROR_KINDS.SERVER:
      return FAILURE_REASONS.SERVER_ERROR;
    case ERROR_KINDS.TIMEOUT:
      return FAILURE_REASONS.TIMEOUT;
    case ERROR_KINDS.UNREACHABLE:
      return FAILURE_REASONS.UNREACHABLE;
    default:
      return FAILURE_REASONS.UNEXPECTED;
  }
}

/**
 * @description Wrap any failure into a BrevoError.
 * @param {Error} err - The failure.
 * @returns {BrevoError} The BrevoError.
 */
function toBrevoError(err) {
  if (err instanceof BrevoError) {
    return err;
  }
  return new BrevoError(err.message, {
    reason: reasonOf(err),
    status: typeof err.status === 'number' ? err.status : null,
    cause: err,
  });
}

/**
 * @description A number of credits, or null when unknown.
 * @param {any} value - The raw value.
 * @returns {number|null} The credits.
 */
function credits(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(number)
    ? number
    : null;
}

/**
 * @description The useful part of `GET /account`.
 * @param {object} data - The answer.
 * @returns {object} `{ email, company, planType, emailCredits, smsCredits, relayEnabled }`.
 * @example
 * parseAccount({ email: 'a@b.c', plan: [{ type: 'free', credits: 250 }, { type: 'sms', credits: 15 }] });
 */
function parseAccount(data) {
  const plans = Array.isArray(data?.plan) ? data.plan : [];
  const smsPlan = plans.find((plan) => plan?.type === 'sms');
  const emailPlan = plans.find((plan) => plan?.type && plan.type !== 'sms');
  return {
    email: typeof data?.email === 'string' ? data.email : '',
    company: typeof data?.companyName === 'string' ? data.companyName : '',
    planType: typeof emailPlan?.type === 'string' ? emailPlan.type : null,
    emailCredits: credits(emailPlan?.credits),
    smsCredits: smsPlan ? (credits(smsPlan.credits) ?? 0) : 0,
    relayEnabled: data?.relay?.enabled !== false,
  };
}

/**
 * @description Whether an SMS text needs unicode (a character outside the GSM
 * alphabet: ê, ç, emojis…). Unicode parts hold 70 characters instead of 160.
 * @param {string} text - The text.
 * @returns {boolean} True when unicode is needed.
 * @example
 * needsUnicode('Porte ouverte'); // -> false
 * needsUnicode('Fenêtre ouverte'); // -> true
 */
function needsUnicode(text) {
  for (const character of String(text ?? '')) {
    if (!GSM_CHARACTERS.has(character)) {
      return true;
    }
  }
  return false;
}

/**
 * @description Check an SMS sender: up to 11 letters and digits, or a number
 * of up to 15 digits (Brevo rules).
 * @param {string} sender - The sender.
 * @returns {boolean} True when Brevo accepts it.
 * @example
 * isValidSmsSender('Gladys'); // -> true
 */
function isValidSmsSender(sender) {
  const text = String(sender ?? '');
  return /^[A-Za-z0-9]{1,11}$/.test(text) || /^\d{1,15}$/.test(text);
}

/**
 * @description Escape a text for HTML.
 * @param {string} text - The text.
 * @returns {string} The escaped text.
 */
const escapeHtml = (text) =>
  String(text ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

/**
 * @description The HTML body of an email: the text, line breaks kept, in a
 * neutral frame. Never HTML from the user: the text is escaped.
 * @param {string} text - The text.
 * @returns {string} The HTML.
 * @example
 * htmlBody('Front door open\nat 10:02');
 */
function htmlBody(text) {
  const paragraphs = escapeHtml(text).replace(/\r?\n/g, '<br>');
  return (
    '<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;' +
    `line-height:1.5;color:#1f2933">${paragraphs || '&nbsp;'}</body></html>`
  );
}

/**
 * @description The subject of a notification: the prefix of the configuration
 * and the first line of the text.
 * @param {string} prefix - The prefix ('Gladys').
 * @param {string} text - The text.
 * @returns {string} The subject.
 * @example
 * notificationSubject('Gladys', 'Front door open\nat 10:02'); // -> 'Gladys: Front door open'
 */
function notificationSubject(prefix, text) {
  const firstLine = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const head = firstLine ? (firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine) : '';
  const subject = prefix && head ? `${prefix}: ${head}` : prefix || head || 'Gladys';
  return subject.slice(0, MAX_SUBJECT_LENGTH);
}

/**
 * @description An image attached by Gladys (`message.file`, a camera
 * snapshot): `image/jpg;base64,…`, with or without `data:`, or raw base64.
 * @param {string|null} file - The attached file.
 * @returns {{ content: string, name: string }|null} The Brevo attachment.
 * @example
 * imageAttachment('image/jpg;base64,/9j/4AAQ…');
 */
function imageAttachment(file) {
  if (typeof file !== 'string' || !file) {
    return null;
  }
  const match = /^(?:data:)?image\/(jpe?g|png|gif|webp);base64,/i.exec(file);
  const body = (match ? file.slice(match[0].length) : file).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(body)) {
    return null;
  }
  const bytes = Buffer.from(body, 'base64');
  if (bytes.length < 8 || bytes.length > MAX_IMAGE_BYTES) {
    return null;
  }
  let kind = match?.[1]?.toLowerCase().replace('jpeg', 'jpg');
  if (!kind) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) kind = 'jpg';
    else if (bytes.toString('latin1', 1, 4) === 'PNG') kind = 'png';
    else return null;
  }
  // Brevo accepts gif, jpg, jpeg, png… but not webp as an attachment.
  if (kind === 'webp') {
    return null;
  }
  return { content: bytes.toString('base64'), name: `gladys.${kind}` };
}

/**
 * @description The delivery status of a Brevo event name, null for the
 * events that say nothing about the delivery (sent, opened, clicks…).
 * Email and SMS events do not spell their names the same way
 * ("hardBounces", "hard_bounce"…).
 * @param {string} event - The event name.
 * @returns {string|null} 'delivered', one of DELIVERY_FAILURES, or null.
 * @example
 * deliveryStatusOf('hardBounces'); // -> 'hard_bounce'
 */
function deliveryStatusOf(event) {
  const name = String(event ?? '').toLowerCase();
  if (/hard/.test(name)) return DELIVERY_FAILURES.HARD_BOUNCE;
  if (/soft/.test(name)) return DELIVERY_FAILURES.SOFT_BOUNCE;
  if (/^bounce/.test(name)) return DELIVERY_FAILURES.HARD_BOUNCE;
  if (/block/.test(name)) return DELIVERY_FAILURES.BLOCKED;
  if (/invalid/.test(name)) return DELIVERY_FAILURES.INVALID;
  if (/spam|complaint/.test(name)) return DELIVERY_FAILURES.SPAM;
  if (/^error/.test(name)) return DELIVERY_FAILURES.ERROR;
  if (/reject/.test(name)) return DELIVERY_FAILURES.REJECTED;
  if (/skip/.test(name)) return DELIVERY_FAILURES.SKIPPED;
  if (/^delivered$/.test(name)) return DELIVERED;
  return null;
}

/**
 * @description Create the Brevo account service.
 * @param {object} options - Options.
 * @param {object} options.api - A Brevo API client (createBrevoClient).
 * @param {Function} options.getConfig - `() => config` (normalizeConfig).
 * @param {Function} [options.wait] - `(ms) => Promise`, pause before a retry.
 * @returns {object} The service.
 * @example
 * const brevo = createBrevoAccount({ api, getConfig: () => config });
 * await brevo.sendEmail({ to: ['alice@example.com'], subject: 'Hi', text: 'Hello' });
 */
function createBrevoAccount({
  api,
  getConfig,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  let sender = null;

  /**
   * @description Make a send call, retried on a 429.
   * @param {string} path - The path.
   * @param {object} body - The body.
   * @returns {Promise<any>} The answer.
   */
  async function postWithRetry(path, body) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await api.post(path, body);
      } catch (err) {
        if (!(err instanceof BrevoApiError) || err.status !== 429 || attempt >= MAX_RETRIES) {
          throw err;
        }
        const pause = Math.min(
          MAX_RETRY_WAIT_MS,
          err.retryAfter !== null ? err.retryAfter * 1000 : 2000 * (attempt + 1),
        );
        await wait(pause);
      }
    }
  }

  /**
   * @description The email sender: the configured address, or the first
   * active sender of the account. Kept until reset().
   * @returns {Promise<{ email: string, name: string }>} The sender.
   */
  async function resolveSender() {
    const config = getConfig();
    if (sender) {
      return sender;
    }
    if (config.senderEmail) {
      sender = { email: config.senderEmail, name: config.senderName };
      return sender;
    }
    const data = await api.get('/senders');
    const found = (Array.isArray(data?.senders) ? data.senders : []).find(
      (entry) => entry?.active === true && typeof entry.email === 'string',
    );
    if (!found) {
      throw new BrevoError('No active email sender on the Brevo account', {
        reason: FAILURE_REASONS.NO_SENDER,
      });
    }
    sender = { email: found.email, name: config.senderName || found.name || 'Gladys' };
    return sender;
  }

  return {
    /**
     * @description Read the plan and the credits.
     * @returns {Promise<object>} parseAccount.
     */
    async readAccount() {
      return parseAccount(await api.get('/account'));
    },

    /**
     * @description List the email senders of the account.
     * @returns {Promise<Array<{ email: string, name: string, active: boolean }>>} The senders.
     */
    async listSenders() {
      const data = await api.get('/senders');
      return (Array.isArray(data?.senders) ? data.senders : [])
        .filter((entry) => typeof entry?.email === 'string')
        .map((entry) => ({
          email: entry.email,
          name: String(entry.name ?? ''),
          active: entry.active === true,
        }));
    },

    resolveSender,

    /** @returns {{ email: string, name: string }|null} The sender, when resolved. */
    sender: () => sender,

    /**
     * @description Send one email to each recipient (one call each: the
     * recipients never see each other's address).
     * @param {object} mail - The email.
     * @param {string[]} mail.to - Normalized addresses.
     * @param {string} mail.subject - The subject.
     * @param {string} mail.text - The text.
     * @param {object|null} [mail.attachment] - imageAttachment.
     * @returns {Promise<Array<{ recipient: string, messageId: string|null }>>} One entry per recipient.
     */
    async sendEmail({ to, subject, text, attachment = null }) {
      const from = await resolveSender();
      const results = [];
      for (const recipient of to) {
        const answer = await postWithRetry('/smtp/email', {
          sender: { email: from.email, ...(from.name ? { name: from.name.slice(0, 70) } : {}) },
          to: [{ email: recipient }],
          subject: String(subject ?? '').slice(0, MAX_SUBJECT_LENGTH) || 'Gladys',
          textContent: String(text ?? ''),
          htmlContent: htmlBody(text),
          ...(attachment ? { attachment: [attachment] } : {}),
          tags: [TAG],
        });
        const messageId =
          typeof answer?.messageId === 'string'
            ? answer.messageId
            : Array.isArray(answer?.messageIds) && typeof answer.messageIds[0] === 'string'
              ? answer.messageIds[0]
              : null;
        results.push({ recipient, messageId });
      }
      return results;
    },

    /**
     * @description Send one SMS to each number.
     * @param {string[]} numbers - Normalized numbers ('+33612345678').
     * @param {string} text - The text (cut at 1,000 characters).
     * @returns {Promise<Array<{ recipient: string, messageId: string|null }>>} One entry per number.
     */
    async sendSms(numbers, text) {
      const config = getConfig();
      if (!isValidSmsSender(config.smsSender)) {
        throw new BrevoError(
          'The SMS sender must hold up to 11 letters and digits, or up to 15 digits',
          { reason: FAILURE_REASONS.INVALID_SENDER },
        );
      }
      const content = String(text ?? '').slice(0, MAX_SMS_LENGTH);
      if (!content.trim()) {
        throw new BrevoError('The SMS text is empty', { reason: FAILURE_REASONS.REJECTED });
      }
      const results = [];
      for (const recipient of numbers) {
        const answer = await postWithRetry('/transactionalSMS/send', {
          sender: config.smsSender,
          recipient: recipient.replace(/^\+/, ''),
          content,
          type: 'transactional',
          tag: TAG,
          unicodeEnabled: needsUnicode(content),
        });
        const id = answer?.messageId;
        results.push({
          recipient,
          messageId: typeof id === 'number' || typeof id === 'string' ? String(id) : null,
        });
      }
      return results;
    },

    /**
     * @description The delivery events of the last two days, for one channel.
     * @param {string} channel - 'email' or 'sms'.
     * @returns {Promise<Array<{ messageId: string, status: string, date: string, reason: string }>>}
     *   The events that tell something about the delivery, oldest first.
     */
    async listDeliveryEvents(channel) {
      const path =
        channel === CHANNELS.SMS
          ? '/transactionalSMS/statistics/events'
          : '/smtp/statistics/events';
      const data = await api.get(path, { days: 2, limit: MAX_EVENTS, sort: 'desc' });
      return (Array.isArray(data?.events) ? data.events : [])
        .map((event) => ({
          messageId: event?.messageId === undefined ? '' : String(event.messageId),
          status: deliveryStatusOf(event?.event),
          date: typeof event?.date === 'string' ? event.date : '',
          reason: typeof event?.reason === 'string' ? event.reason.slice(0, 300) : '',
        }))
        .filter((event) => event.messageId && event.status)
        .reverse();
    },

    /** @description Forget the sender (new configuration). */
    reset() {
      sender = null;
    },
  };
}

export {
  createBrevoAccount,
  BrevoError,
  FAILURE_REASONS,
  DELIVERY_FAILURES,
  DELIVERED,
  CHANNELS,
  TAG,
  MAX_SMS_LENGTH,
  reasonOf,
  toBrevoError,
  parseAccount,
  needsUnicode,
  isValidSmsSender,
  htmlBody,
  notificationSubject,
  imageAttachment,
  deliveryStatusOf,
};
