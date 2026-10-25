// -----------------------------------------------------------------------------
// The Brevo API client and the account service, against the fake Brevo of
// test/helpers/fake-brevo.js. Nothing touches the network.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBrevoClient, BrevoApiError, kindOf, queryString } from '../src/brevo-api.js';
import {
  createBrevoAccount,
  FAILURE_REASONS,
  reasonOf,
  toBrevoError,
  parseAccount,
  needsUnicode,
  isValidSmsSender,
  htmlBody,
  notificationSubject,
  imageAttachment,
  deliveryStatusOf,
} from '../src/brevo.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeBrevo, API_KEY } from './helpers/fake-brevo.js';

/**
 * @description An account service on the fake Brevo.
 * @param {object} [fake] - Options of createFakeBrevo.
 * @param {object} [raw] - Configuration values on top of the key.
 * @returns {object} `{ brevo, fake, waits }`.
 */
function setup(fake = {}, raw = {}) {
  const server = createFakeBrevo(fake);
  const config = normalizeConfig({ api_key: API_KEY, ...raw });
  const api = createBrevoClient({ getApiKey: () => config.apiKey, transport: server.transport });
  const waits = [];
  const brevo = createBrevoAccount({
    api,
    getConfig: () => config,
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  return { brevo, fake: server, waits };
}

test('every call carries the key in the api-key header, never in the URL', async () => {
  const seen = [];
  const api = createBrevoClient({
    getApiKey: () => 'xkeysib-secret',
    transport: async (url, init) => {
      seen.push({ url, init });
      return { status: 200, text: '{"ok":true}', headers: {} };
    },
  });
  assert.deepEqual(await api.get('/account', { days: 2, empty: '' }), { ok: true });
  assert.equal(seen[0].url, 'https://api.brevo.com/v3/account?days=2');
  assert.equal(seen[0].init.headers['api-key'], 'xkeysib-secret');
  assert.doesNotMatch(seen[0].url, /secret/);
  await api.post('/smtp/email', { a: 1 });
  assert.equal(seen[1].init.headers['Content-Type'], 'application/json');
  assert.equal(seen[1].init.body, '{"a":1}');
});

test('errors: kinds, Brevo code and message, never the key', async () => {
  const api = createBrevoClient({
    getApiKey: () => 'xkeysib-secret',
    transport: async () => ({
      status: 400,
      text: '{"code":"invalid_parameter","message":"sender is invalid / inactive"}',
      headers: {},
    }),
  });
  const err = await api.get('/senders').catch((error) => error);
  assert.ok(err instanceof BrevoApiError);
  assert.equal(err.kind, 'bad_request');
  assert.equal(err.code, 'invalid_parameter');
  assert.equal(err.brevoMessage, 'sender is invalid / inactive');
  assert.doesNotMatch(err.message, /secret/);

  const missing = createBrevoClient({ getApiKey: () => '', transport: async () => assert.fail() });
  assert.equal((await missing.get('/account').catch((error) => error)).kind, 'auth');

  const offline = createBrevoClient({
    getApiKey: () => 'k',
    transport: async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    },
  });
  const down = await offline.get('/account').catch((error) => error);
  assert.equal(down.kind, 'unreachable');
  assert.match(down.message, /ENOTFOUND/);

  const slow = createBrevoClient({
    getApiKey: () => 'k',
    transport: async () => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    },
  });
  assert.equal((await slow.get('/account').catch((error) => error)).kind, 'timeout');
});

test('kindOf: an unknown IP address is not a wrong key', () => {
  assert.equal(kindOf(401, 'unauthorized Key not found'), 'auth');
  assert.equal(
    kindOf(401, 'unauthorized We have detected you are using an unrecognised IP address 1.2.3.4'),
    'ip_blocked',
  );
  assert.equal(kindOf(403, ''), 'forbidden');
  assert.equal(kindOf(404, ''), 'not_found');
  assert.equal(kindOf(429, ''), 'rate_limited');
  assert.equal(kindOf(502, ''), 'server');
  assert.equal(kindOf(400, ''), 'bad_request');
  assert.equal(queryString({}), '');
});

test('reasonOf: each Brevo failure gets its reason', () => {
  const error = (status, code, message, kind = kindOf(status, `${code} ${message}`)) =>
    new BrevoApiError('x', { kind, status, code, brevoMessage: message });
  assert.equal(reasonOf(error(400, 'not_enough_credits', 'x')), 'not_enough_credits');
  assert.equal(reasonOf(error(402, 'x', 'Insufficient credits')), 'not_enough_credits');
  assert.equal(reasonOf(error(400, 'permission_denied', 'x')), 'account_restricted');
  assert.equal(reasonOf(error(400, 'account_under_validation', 'x')), 'account_restricted');
  assert.equal(reasonOf(error(403, null, '')), 'account_restricted');
  assert.equal(reasonOf(error(401, 'unauthorized', 'Key not found')), 'access_denied');
  assert.equal(
    reasonOf(error(401, 'unauthorized', 'unrecognised IP address')),
    'ip_not_authorized',
  );
  assert.equal(reasonOf(error(400, 'invalid_parameter', 'Sender is invalid')), 'invalid_sender');
  assert.equal(
    reasonOf(error(400, 'invalid_parameter', 'email is not valid in to')),
    'invalid_recipient',
  );
  assert.equal(reasonOf(error(400, 'invalid_parameter', 'something')), 'rejected');
  assert.equal(reasonOf(error(429, null, '')), 'rate_limited');
  assert.equal(reasonOf(error(500, null, '')), 'server_error');
  assert.equal(reasonOf(new BrevoApiError('x', { kind: 'auth' })), 'not_configured');
  assert.equal(reasonOf(new Error('boom')), 'unexpected');
  assert.equal(toBrevoError(error(429, null, '')).status, 429);
  for (const reason of Object.values(FAILURE_REASONS)) {
    assert.match(reason, /^[a-z_]+$/);
  }
});

test('parseAccount: email credits of the plan, SMS credits apart', () => {
  assert.deepEqual(
    parseAccount({
      email: 'a@b.fr',
      companyName: 'Home',
      plan: [
        { type: 'free', creditsType: 'sendLimit', credits: 250 },
        { type: 'sms', creditsType: 'sendLimit', credits: 15.5 },
      ],
      relay: { enabled: true },
    }),
    {
      email: 'a@b.fr',
      company: 'Home',
      planType: 'free',
      emailCredits: 250,
      smsCredits: 15.5,
      relayEnabled: true,
    },
  );
  const empty = parseAccount({});
  assert.equal(empty.emailCredits, null);
  assert.equal(empty.smsCredits, 0, 'no SMS plan: no SMS credits');
});

test('SMS rules: sender, unicode', () => {
  assert.equal(isValidSmsSender('Gladys'), true);
  assert.equal(isValidSmsSender('MaMaison123'), true);
  assert.equal(isValidSmsSender('MaMaison1234'), false, '12 characters');
  assert.equal(isValidSmsSender('Ma Maison'), false, 'a space');
  assert.equal(isValidSmsSender('336123456789012'), true, '15 digits');
  assert.equal(isValidSmsSender(''), false);
  assert.equal(needsUnicode('Porte d’entrée ouverte'), true, 'the typographic apostrophe');
  assert.equal(needsUnicode("Porte d'entrée ouverte à 10:02"), false);
  assert.equal(needsUnicode('Fenêtre ouverte'), true);
  assert.equal(needsUnicode('Alarme 🚨'), true);
});

test('email content: subject from the first line, escaped HTML, camera image', () => {
  assert.equal(
    notificationSubject('Gladys', '\n Front door open \nat 10:02'),
    'Gladys: Front door open',
  );
  assert.equal(notificationSubject('', 'Hello'), 'Hello');
  assert.equal(notificationSubject('Gladys', ''), 'Gladys');
  assert.ok(notificationSubject('G', 'x'.repeat(300)).length <= 84);
  const html = htmlBody('<b>bold</b>\nline 2 & more');
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;<br>line 2 &amp; more/);

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]).toString('base64');
  assert.deepEqual(imageAttachment(`image/jpg;base64,${jpeg}`), {
    content: jpeg,
    name: 'gladys.jpg',
  });
  assert.equal(imageAttachment(jpeg).name, 'gladys.jpg', 'raw base64 recognized by its magic');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0]).toString('base64');
  assert.equal(imageAttachment(`data:image/png;base64,${png}`).name, 'gladys.png');
  assert.equal(
    imageAttachment('data:image/webp;base64,UklGRg=='),
    null,
    'webp is refused by Brevo',
  );
  assert.equal(imageAttachment('not base64 at all!'), null);
  assert.equal(imageAttachment(null), null);
});

test('deliveryStatusOf: email and SMS event names', () => {
  assert.equal(deliveryStatusOf('hardBounces'), 'hard_bounce');
  assert.equal(deliveryStatusOf('hard_bounce'), 'hard_bounce');
  assert.equal(deliveryStatusOf('softBounce'), 'soft_bounce');
  assert.equal(deliveryStatusOf('bounces'), 'hard_bounce');
  assert.equal(deliveryStatusOf('blocked'), 'blocked');
  assert.equal(deliveryStatusOf('invalid'), 'invalid');
  assert.equal(deliveryStatusOf('spam'), 'spam');
  assert.equal(deliveryStatusOf('error'), 'error');
  assert.equal(deliveryStatusOf('rejected'), 'rejected');
  assert.equal(deliveryStatusOf('skipped'), 'skipped');
  assert.equal(deliveryStatusOf('delivered'), 'delivered');
  for (const quiet of ['sent', 'requests', 'opened', 'clicks', 'deferred', 'accepted', 'replies']) {
    assert.equal(deliveryStatusOf(quiet), null, quiet);
  }
});

test('the sender: the first active one of the account, or the configured address', async () => {
  const { brevo, fake } = setup();
  assert.deepEqual(await brevo.resolveSender(), { email: 'gladys@example.com', name: 'Gladys' });
  await brevo.resolveSender();
  assert.equal(fake.calls.filter((call) => call.path === '/senders').length, 1, 'kept');

  const configured = setup({}, { sender_email: 'Alerts@Example.COM', sender_name: 'Maison' });
  assert.deepEqual(await configured.brevo.resolveSender(), {
    email: 'Alerts@example.com',
    name: 'Maison',
  });
  assert.equal(configured.fake.calls.length, 0, 'no call needed');

  const none = setup({ senders: [{ id: 1, name: 'x', email: 'x@y.fr', active: false }] });
  const err = await none.brevo.resolveSender().catch((error) => error);
  assert.equal(err.reason, 'no_sender');
});

test('sendEmail: one call per recipient, tagged, text and HTML, image attached', async () => {
  const { brevo, fake } = setup();
  const sent = await brevo.sendEmail({
    to: ['a@example.com', 'b@example.com'],
    subject: 'Gladys: Front door open',
    text: 'Front door open',
    attachment: { content: 'AAAA', name: 'gladys.jpg' },
  });
  assert.equal(sent.length, 2);
  assert.match(sent[0].messageId, /^<.+@smtp-relay\.mailin\.fr>$/);
  const [first, second] = fake.sentEmails();
  assert.deepEqual(first.to, [{ email: 'a@example.com' }]);
  assert.deepEqual(second.to, [{ email: 'b@example.com' }]);
  assert.deepEqual(first.sender, { email: 'gladys@example.com', name: 'Gladys' });
  assert.equal(first.subject, 'Gladys: Front door open');
  assert.equal(first.textContent, 'Front door open');
  assert.match(first.htmlContent, /Front door open/);
  assert.deepEqual(first.attachment, [{ content: 'AAAA', name: 'gladys.jpg' }]);
  assert.deepEqual(first.tags, ['gladys']);
});

test('sendSms: recipient without +, sender, transactional, unicode when needed', async () => {
  const { brevo, fake } = setup({}, { sms_sender: 'Ma Maison' });
  const sent = await brevo.sendSms(['+33612345678'], 'Fenêtre ouverte');
  assert.match(sent[0].messageId, /^\d+$/);
  assert.deepEqual(fake.sentSms()[0], {
    sender: 'MaMaison',
    recipient: '33612345678',
    content: 'Fenêtre ouverte',
    type: 'transactional',
    tag: 'gladys',
    unicodeEnabled: true,
  });
  assert.equal(
    (await brevo.sendSms(['+33612345678'], 'x'.repeat(1500))).length,
    1,
    'a long text is cut, not refused',
  );
  assert.equal(fake.sentSms()[1].content.length, 1000);

  const bad = setup({}, { sms_sender: 'ThisIsWayTooLong' });
  const err = await bad.brevo.sendSms(['+33612345678'], 'x').catch((error) => error);
  assert.equal(err.reason, 'invalid_sender');
  assert.equal(bad.fake.calls.length, 0);

  const empty = await setup()
    .brevo.sendSms(['+33612345678'], '  ')
    .catch((error) => error);
  assert.equal(empty.reason, 'rejected');
});

test('a 429 is retried after the reset Brevo announces; other failures never', async () => {
  const limited = setup({
    emails: [
      {
        status: 429,
        body: { code: 'too_many_requests', message: 'x' },
        headers: { 'x-sib-ratelimit-reset': '3' },
      },
      { status: 201 },
    ],
  });
  const sent = await limited.brevo.sendEmail({ to: ['a@example.com'], subject: 's', text: 't' });
  assert.equal(sent.length, 1);
  assert.deepEqual(limited.waits, [3000]);

  const always = setup({ sms: [{ status: 429, body: {}, headers: {} }] });
  const err = await always.brevo.sendSms(['+33612345678'], 'x').catch((error) => error);
  assert.equal(toBrevoError(err).reason, 'rate_limited');
  assert.equal(always.fake.sentSms().length, 3, 'one call and two retries');

  const server = setup({ emails: [{ status: 502, body: {} }] });
  await server.brevo.sendEmail({ to: ['a@example.com'], subject: 's', text: 't' }).catch(() => {});
  assert.equal(server.fake.sentEmails().length, 1, 'a 5xx is never retried: it may have left');
});

test('listDeliveryEvents: the events that say something, oldest first', async () => {
  const { brevo, fake } = setup({
    emailEvents: [
      {
        email: 'a@b.fr',
        date: '2026-10-25T10:05:00Z',
        messageId: '<2>',
        event: 'hardBounces',
        reason: 'no such user',
      },
      { email: 'a@b.fr', date: '2026-10-25T10:04:00Z', messageId: '<1>', event: 'opened' },
      { email: 'a@b.fr', date: '2026-10-25T10:01:00Z', messageId: '<1>', event: 'delivered' },
    ],
    smsEvents: [
      {
        phoneNumber: '33612345678',
        date: '2026-10-25T10:00:00Z',
        messageId: 1511882900100000,
        event: 'delivered',
      },
    ],
  });
  assert.deepEqual(await brevo.listDeliveryEvents('email'), [
    { messageId: '<1>', status: 'delivered', date: '2026-10-25T10:01:00Z', reason: '' },
    {
      messageId: '<2>',
      status: 'hard_bounce',
      date: '2026-10-25T10:05:00Z',
      reason: 'no such user',
    },
  ]);
  assert.deepEqual(fake.calls.at(-1).query, { days: '2', limit: '500', sort: 'desc' });
  assert.deepEqual(await brevo.listDeliveryEvents('sms'), [
    {
      messageId: '1511882900100000',
      status: 'delivered',
      date: '2026-10-25T10:00:00Z',
      reason: '',
    },
  ]);
});
