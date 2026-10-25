// -----------------------------------------------------------------------------
// A fake Brevo API, as the transport of src/brevo-api.js: it answers the
// endpoints the integration uses, with the formats of the Brevo reference
// (developers.brevo.com), and checks the API key. Nothing touches the network.
// -----------------------------------------------------------------------------

// Never shaped like a real key (xkeysib-<64 hex>-<16 chars>): the secret
// scanning of GitHub would block the push.
const API_KEY = 'xkeysib-not-a-real-key';
const KEYS = Object.freeze({ api_key: API_KEY });
const BASE = 'https://api.brevo.com/v3';

/**
 * @description A Brevo JSON answer.
 * @param {number} status - HTTP status.
 * @param {any} body - JSON body.
 * @param {object} [headers] - Headers.
 * @returns {{ status: number, text: string, headers: object }} The answer.
 */
const answer = (status, body, headers = {}) => ({
  status,
  text: body === undefined ? '' : JSON.stringify(body),
  headers,
});

/**
 * @description Create the fake API.
 * @param {object} [options] - What it serves.
 * @param {object} [options.account] - GET /account.
 * @param {object[]} [options.senders] - GET /senders.
 * @param {Array} [options.emails] - Answers of POST /smtp/email, one per call (the last
 *   repeats): `{ status, body, headers }`.
 * @param {Array} [options.sms] - Answers of POST /transactionalSMS/send, same format.
 * @param {object[]} [options.emailEvents] - GET /smtp/statistics/events.
 * @param {object[]} [options.smsEvents] - GET /transactionalSMS/statistics/events.
 * @param {boolean} [options.ipBlocked] - Answer every call with the 401 of an unknown IP.
 * @returns {object} `{ transport, calls, state, sentEmails, sentSms }`.
 * @example
 * const brevo = createFakeBrevo();
 * createApp(gladys, { transport: brevo.transport });
 */
function createFakeBrevo({
  account = {
    organization_id: 'org',
    user_id: 1,
    enterprise: false,
    companyName: 'Maison Martin',
    email: 'owner@example.com',
    firstName: 'Alice',
    lastName: 'Martin',
    plan: [
      { type: 'free', creditsType: 'sendLimit', credits: 297 },
      { type: 'sms', creditsType: 'sendLimit', credits: 50 },
    ],
    relay: { enabled: true, data: { userName: 'x', relay: 'smtp-relay.brevo.com', port: 587 } },
  },
  senders = [
    { id: 1, name: 'Old', email: 'old@example.com', active: false, ips: [] },
    { id: 2, name: 'Maison', email: 'gladys@example.com', active: true, ips: [] },
  ],
  emails = [{ status: 201 }],
  sms = [{ status: 201 }],
  emailEvents = [],
  smsEvents = [],
  ipBlocked = false,
} = {}) {
  const calls = [];
  const state = {
    account,
    senders,
    emails: [...emails],
    sms: [...sms],
    emailEvents,
    smsEvents,
    ipBlocked,
    down: null,
  };
  let nextEmail = 1;
  let nextSms = 1511882900100000;

  /**
   * @description The next scripted answer of a list (the last one repeats).
   * @param {Array} list - The answers.
   * @returns {object} The answer.
   */
  const next = (list) => (list.length > 1 ? list.shift() : list[0]);

  /**
   * @description The transport (url, init) => answer.
   * @param {string} url - The URL.
   * @param {object} init - fetch options.
   * @returns {Promise<object>} The answer.
   */
  async function transport(url, init) {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/v3/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path, query: Object.fromEntries(parsed.searchParams), body });
    assert(url.startsWith(BASE), `unexpected base: ${url}`);
    if (state.down) {
      throw state.down;
    }
    if (state.ipBlocked) {
      return answer(401, {
        code: 'unauthorized',
        message:
          'We have detected you are using an unrecognised IP address 203.0.113.7. If you performed this action make sure to add the new IP address in this link: https://app.brevo.com/security/authorised_ips',
      });
    }
    if (init.headers['api-key'] !== API_KEY) {
      return answer(401, { code: 'unauthorized', message: 'Key not found' });
    }
    if (init.method === 'GET' && path === '/account') {
      return answer(200, state.account);
    }
    if (init.method === 'GET' && path === '/senders') {
      return answer(200, { senders: state.senders });
    }
    if (init.method === 'POST' && path === '/smtp/email') {
      const scripted = next(state.emails);
      if (scripted.status !== 201) {
        return answer(scripted.status, scripted.body, scripted.headers);
      }
      const messageId = `<20261025100000.${nextEmail++}@smtp-relay.mailin.fr>`;
      return answer(201, { messageId });
    }
    if (init.method === 'POST' && path === '/transactionalSMS/send') {
      const scripted = next(state.sms);
      if (scripted.status !== 201) {
        return answer(scripted.status, scripted.body, scripted.headers);
      }
      return answer(201, { messageId: nextSms++ });
    }
    if (init.method === 'GET' && path === '/smtp/statistics/events') {
      return answer(200, { events: [...state.emailEvents] });
    }
    if (init.method === 'GET' && path === '/transactionalSMS/statistics/events') {
      return answer(200, { events: [...state.smsEvents] });
    }
    return answer(404, { code: 'document_not_found', message: 'Not found' });
  }

  return {
    transport,
    calls,
    state,
    /** @returns {object[]} The bodies of the emails sent. */
    sentEmails: () =>
      calls
        .filter((call) => call.method === 'POST' && call.path === '/smtp/email')
        .map((c) => c.body),
    /** @returns {object[]} The bodies of the SMS sent. */
    sentSms: () =>
      calls
        .filter((call) => call.method === 'POST' && call.path === '/transactionalSMS/send')
        .map((c) => c.body),
  };
}

/**
 * @description A tiny assert that does not depend on node:assert in a helper.
 * @param {boolean} condition - The condition.
 * @param {string} message - The message.
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export { createFakeBrevo, KEYS, API_KEY };
