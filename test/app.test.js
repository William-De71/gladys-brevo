// -----------------------------------------------------------------------------
// The handlers of src/app.js, driven by the fake Gladys of the SDK (the real
// GladysIntegration with an in-memory Gladys, so payloads are checked the way
// the core checks them) against a fake Brevo API. Nothing touches the network;
// the state file lives in a temporary directory.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, TEST_MESSAGE } from '../src/app.js';
import { createFakeBrevo, KEYS } from './helpers/fake-brevo.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const EMAIL_CONTACT = { channel: 'email', email: 'alice@example.com' };
const SMS_CONTACT = { channel: 'sms', phone_number: '06 12 34 56 78' };
const BOTH_CONTACT = { channel: 'both', email: 'alice@example.com', phone_number: '0612345678' };
const MESSAGE = { text: 'The front door is open\nat 10:02', file: null };
const JPEG = `image/jpg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')}`;

/**
 * @description A connected fake Gladys running the integration against a fake Brevo.
 * @param {object} [options] - Options.
 * @param {object} [options.config] - Configuration values on top of the key.
 * @param {object} [options.brevo] - Options of createFakeBrevo.
 * @param {string} [options.statePath] - The state file (a new temporary one by default).
 * @param {Function} [options.now] - The clock.
 * @returns {Promise<object>} `{ gladys, brevo, app, statePath }`.
 */
async function start({ config = {}, brevo: fake = {}, statePath, now = () => Date.now() } = {}) {
  const path = statePath ?? join(await mkdtemp(join(tmpdir(), 'brevo-')), 'state.json');
  const brevo = createFakeBrevo(fake);
  const gladys = createFakeGladys({ config: { ...KEYS, ...config } });
  const app = createApp(gladys, {
    transport: brevo.transport,
    statePath: path,
    now,
    wait: async () => {},
    timers: false,
  });
  await gladys.connect();
  return { gladys, brevo, app, statePath: path };
}

/**
 * @description Check a scene event against its manifest declaration.
 * @param {object} event - `{ key, data }`.
 */
function assertDeclared(event) {
  const trigger = byKey(manifest.scene_triggers).get(event.key);
  assert.ok(trigger, event.key);
  const variables = trigger.variables.map((variable) => variable.key).sort();
  assert.deepEqual(Object.keys(event.data).sort(), variables, event.key);
  for (const value of Object.values(event.data)) {
    assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
  }
  // Filters compare by equality: the value of a select field must be one of its options.
  for (const field of trigger.fields ?? []) {
    if (field.options && event.data[field.key] !== undefined) {
      const values = field.options.map((option) => option.value);
      assert.ok(values.includes(event.data[field.key]), `${event.key}.${field.key}`);
    }
  }
}

const outputsOf = (ack) => ack.data?.outputs ?? ack.data;
const messageOf = (ack) => ack.data?.message ?? ack.data;

test('connects: reads the account and reports credits and sender', async () => {
  const { gladys } = await start();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.fr,
    'Compte Brevo Maison Martin : 297 crédits e-mail, 50 crédits SMS, expéditeur gladys@example.com.',
  );
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('without a key: disconnected with a message in four languages, no Brevo call', async () => {
  const brevo = createFakeBrevo();
  const gladys = createFakeGladys({ config: {} });
  createApp(gladys, {
    transport: brevo.transport,
    statePath: '/nonexistent/state.json',
    timers: false,
  });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.deepEqual(Object.keys(gladys.fake.connectionStatus.message).sort(), [
    'de',
    'en',
    'es',
    'fr',
  ]);
  assert.equal(brevo.calls.length, 0);
});

test('refused key, blocked IP: disconnected, each with its own advice', async () => {
  const refused = await start({ config: { api_key: 'xkeysib-revoked' } });
  assert.equal(refused.gladys.fake.connectionStatus.connected, false);
  assert.match(refused.gladys.fake.connectionStatus.message.en, /refuses the API key/);

  const blocked = await start({ brevo: { ipBlocked: true } });
  assert.match(blocked.gladys.fake.connectionStatus.message.en, /Authorized IPs/);
  assert.equal(await blocked.app.followDeliveries(), 0);
});

test('connected without an active sender: says the emails cannot leave yet', async () => {
  const { gladys } = await start({ brevo: { senders: [] } });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /No active email sender/);
});

test('a notification by email: subject from the first line, camera image attached', async () => {
  const { gladys, brevo, app } = await start();
  const ack = await gladys.fake.sendMessage(EMAIL_CONTACT, { ...MESSAGE, file: JPEG });
  assert.equal(ack.success, true);
  const [mail] = brevo.sentEmails();
  assert.deepEqual(mail.to, [{ email: 'alice@example.com' }]);
  assert.equal(mail.subject, 'Gladys: The front door is open');
  assert.equal(mail.textContent, MESSAGE.text);
  assert.equal(mail.attachment[0].name, 'gladys.jpg');
  assert.equal(app.store.counters().dayEmail, 1);
  assert.deepEqual(gladys.fake.sceneEvents, []);
  const [last] = app.store.recentMessages();
  assert.equal(last.recipient, 'a***@example.com', 'the state file never holds the address');
});

test('a notification by SMS: international number, text only', async () => {
  const { gladys, brevo, app } = await start();
  const ack = await gladys.fake.sendMessage(SMS_CONTACT, { ...MESSAGE, file: JPEG });
  assert.equal(ack.success, true);
  assert.equal(brevo.sentEmails().length, 0);
  const [sms] = brevo.sentSms();
  assert.equal(sms.recipient, '33612345678');
  assert.equal(sms.content, MESSAGE.text);
  assert.equal(app.store.counters().daySms, 1);
});

test('both channels: one failing does not fail the notification, both failing does', async () => {
  const half = await start({
    brevo: { sms: [{ status: 400, body: { code: 'not_enough_credits', message: 'x' } }] },
  });
  const ack = await half.gladys.fake.sendMessage(BOTH_CONTACT, MESSAGE);
  assert.equal(ack.success, true, 'the email went out');
  assert.equal(half.brevo.sentEmails().length, 1);
  assert.deepEqual(
    half.gladys.fake.sceneEvents.map((event) => [event.key, event.data.channel, event.data.reason]),
    [['message_not_sent', 'sms', 'not_enough_credits']],
  );
  half.gladys.fake.sceneEvents.forEach(assertDeclared);

  const none = await start({
    brevo: {
      emails: [{ status: 400, body: { code: 'not_enough_credits', message: 'x' } }],
      sms: [{ status: 400, body: { code: 'not_enough_credits', message: 'x' } }],
    },
  });
  const failed = await none.gladys.fake.sendMessage(BOTH_CONTACT, MESSAGE);
  assert.equal(failed.success, false);
  assert.equal(none.gladys.fake.sceneEvents.length, 2, 'one per channel');
});

test('message_not_sent fires once per channel, until a message of that channel goes through', async () => {
  const { gladys, brevo } = await start({
    brevo: { emails: [{ status: 401, body: { code: 'unauthorized', message: 'Key not found' } }] },
  });
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await gladys.fake.sendMessage(EMAIL_CONTACT, MESSAGE)).success, false);
  }
  assert.equal(gladys.fake.sceneEvents.length, 1);
  assert.deepEqual(gladys.fake.sceneEvents[0].data, {
    channel: 'email',
    reason: 'access_denied',
    status: 401,
    error: 'Brevo API answered HTTP 401 to POST /smtp/email: Key not found',
    recipient: 'a***@example.com',
  });
  brevo.state.emails = [{ status: 201 }];
  assert.equal((await gladys.fake.sendMessage(EMAIL_CONTACT, MESSAGE)).success, true);
  brevo.state.emails = [{ status: 401, body: { code: 'unauthorized', message: 'Key not found' } }];
  await gladys.fake.sendMessage(EMAIL_CONTACT, MESSAGE);
  assert.equal(gladys.fake.sceneEvents.length, 2, 'armed again after a success');
});

test('a user without an address: not sent, reason invalid_recipient, no Brevo call', async () => {
  const { gladys, brevo } = await start();
  const before = brevo.calls.length;
  const ack = await gladys.fake.sendMessage({ channel: 'email', email: '' }, MESSAGE);
  assert.equal(ack.success, false);
  assert.equal(brevo.calls.length, before);
  assert.equal(gladys.fake.sceneEvents[0].data.reason, 'invalid_recipient');
  assertDeclared(gladys.fake.sceneEvents[0]);
});

test('delivery follow-up: delivered quietly, a bounce fires delivery_failed once, even after a restart', async () => {
  let clock = Date.parse('2026-10-25T10:00:00Z');
  const first = await start({ now: () => clock });
  await first.gladys.fake.sendMessage(EMAIL_CONTACT, MESSAGE);
  await first.gladys.fake.sendMessage(SMS_CONTACT, MESSAGE);
  const [sms, mail] = first.app.store.recentMessages();
  clock += 5 * 60 * 1000;
  first.brevo.state.emailEvents = [
    {
      email: 'alice@example.com',
      date: '2026-10-25T10:03:00Z',
      messageId: mail.id,
      event: 'hardBounces',
      reason: '550 no such user',
    },
    {
      email: 'alice@example.com',
      date: '2026-10-25T10:02:00Z',
      messageId: '<someone-else>',
      event: 'hardBounces',
    },
  ];
  first.brevo.state.smsEvents = [
    {
      phoneNumber: '33612345678',
      date: '2026-10-25T10:01:00Z',
      messageId: Number(sms.id),
      event: 'delivered',
    },
  ];
  assert.equal(await first.app.followDeliveries(), 1);
  assert.equal(await first.app.followDeliveries(), 0, 'once per message');
  const events = first.gladys.fake.sceneEvents.filter((event) => event.key === 'delivery_failed');
  assert.equal(events.length, 1);
  assertDeclared(events[0]);
  assert.deepEqual(events[0].data, {
    channel: 'email',
    event: 'hard_bounce',
    recipient: 'a***@example.com',
    subject: 'Gladys: The front door is open',
    reason: '550 no such user',
    message_id: mail.id,
    sent_at: '2026-10-25T10:00:00.000Z',
  });
  const statuses = first.app.store.recentMessages().map((entry) => entry.status);
  assert.deepEqual(statuses, ['delivered', 'hard_bounce']);
  await first.app.store.flush();

  // A restart: the same events are read again, nothing fires.
  const again = await start({ statePath: first.statePath, now: () => clock });
  again.brevo.state.emailEvents = first.brevo.state.emailEvents;
  assert.equal(await again.app.followDeliveries(), 0);
  assert.deepEqual(again.gladys.fake.sceneEvents, []);
});

test('delivery follow-up: no call when nothing waits, nor when turned off', async () => {
  const quiet = await start();
  const before = quiet.brevo.calls.length;
  assert.equal(await quiet.app.followDeliveries(), 0);
  assert.equal(quiet.brevo.calls.length, before, 'nothing sent: nothing to read');

  const off = await start({ config: { follow_deliveries: false } });
  await off.gladys.fake.sendMessage(EMAIL_CONTACT, MESSAGE);
  const sent = off.brevo.calls.length;
  assert.equal(await off.app.followDeliveries(), 0);
  assert.equal(off.brevo.calls.length, sent);

  let clock = Date.parse('2026-10-25T10:00:00Z');
  const old = await start({ now: () => clock });
  await old.gladys.fake.sendMessage(EMAIL_CONTACT, MESSAGE);
  clock += 49 * 60 * 60 * 1000;
  const calls = old.brevo.calls.length;
  await old.app.followDeliveries();
  assert.equal(old.brevo.calls.length, calls, 'followed two days, not more');
});

test('credits_low: once below the threshold, armed again above it, never twice after a restart', async () => {
  const lowAccount = (credits) => ({
    companyName: 'Home',
    email: 'o@example.com',
    plan: [
      { type: 'free', credits: 300 },
      { type: 'sms', credits },
    ],
  });
  const first = await start({ brevo: { account: lowAccount(5) } });
  assert.deepEqual(
    first.gladys.fake.sceneEvents.map((event) => [event.key, event.data]),
    [['credits_low', { credits_left: 5, threshold: 20 }]],
  );
  first.gladys.fake.sceneEvents.forEach(assertDeclared);
  await first.app.refreshAccount();
  assert.equal(first.gladys.fake.sceneEvents.length, 1);
  await first.app.store.flush();

  const restarted = await start({ statePath: first.statePath, brevo: { account: lowAccount(5) } });
  assert.deepEqual(restarted.gladys.fake.sceneEvents, []);
  restarted.brevo.state.account = lowAccount(500);
  await restarted.app.refreshAccount();
  restarted.brevo.state.account = lowAccount(3);
  await restarted.app.refreshAccount();
  assert.equal(restarted.gladys.fake.sceneEvents.length, 1, 'armed again after a top-up');

  const off = await start({
    config: { low_credits_threshold: 0 },
    brevo: { account: lowAccount(0) },
  });
  assert.deepEqual(off.gladys.fake.sceneEvents, [], '0 turns it off');
});

test('send_email scene action: each address, refused ones reported, declared outputs only', async () => {
  const { gladys, brevo } = await start();
  const ack = await gladys.fake.sceneAction('send_email', {
    to: 'neighbor@example.com, sitter@example.org, nope',
    subject: '',
    message: 'Can you feed the cat?',
  });
  assert.equal(ack.success, true);
  const outputs = outputsOf(ack);
  const declared = byKey(manifest.scene_actions)
    .get('send_email')
    .outputs.map((o) => o.key);
  assert.deepEqual(Object.keys(outputs).sort(), [...declared].sort());
  assert.equal(outputs.sent_count, 2);
  assert.equal(outputs.invalid_addresses, 'nope');
  assert.match(outputs.message_id, /^<.+>$/);
  assert.equal(brevo.sentEmails()[0].subject, 'Gladys: Can you feed the cat?');
  assert.deepEqual(gladys.fake.sceneEvents, [], 'a scene action never fires a trigger');

  const none = await gladys.fake.sceneAction('send_email', { to: 'nope', message: 'x' });
  assert.equal(none.success, false);
  const many = Array.from({ length: 21 }, (_, i) => `u${i}@example.com`).join(',');
  assert.equal(
    (await gladys.fake.sceneAction('send_email', { to: many, message: 'x' })).success,
    false,
  );
});

test('send_sms scene action: several numbers, refused ones reported', async () => {
  const { gladys, brevo } = await start();
  const ack = await gladys.fake.sceneAction('send_sms', {
    phone_numbers: '06 12 34 56 78, +32470123456, nope',
    message: 'Dinner is ready',
  });
  assert.equal(ack.success, true);
  assert.deepEqual(outputsOf(ack), { sent_count: 2, invalid_numbers: 'nope' });
  assert.deepEqual(
    brevo.sentSms().map((sms) => sms.recipient),
    ['33612345678', '32470123456'],
  );
  const failing = await start({
    brevo: { sms: [{ status: 400, body: { code: 'not_enough_credits', message: 'x' } }] },
  });
  const failed = await failing.gladys.fake.sceneAction('send_sms', {
    phone_numbers: '0612345678',
    message: 'x',
  });
  assert.equal(failed.success, false);
  assert.deepEqual(failing.gladys.fake.sceneEvents, [], 'never a trigger from an action');
});

test('get_account scene action: credits and counters', async () => {
  const { gladys } = await start();
  await gladys.fake.sendMessage(EMAIL_CONTACT, MESSAGE);
  await gladys.fake.sendMessage(SMS_CONTACT, MESSAGE);
  assert.deepEqual(outputsOf(await gladys.fake.sceneAction('get_account')), {
    email_credits: 297,
    sms_credits: 50,
    plan: 'free',
    emails_today: 1,
    sms_today: 1,
    emails_this_month: 1,
    sms_this_month: 1,
  });
});

test('Configuration screen: test the connection, send a test', async () => {
  const { gladys, brevo } = await start();
  const tested = await gladys.fake.action('test_connection');
  assert.equal(tested.success, true);
  assert.equal(
    messageOf(tested).fr,
    'Connecté à Maison Martin : 297 crédits e-mail, 50 crédits SMS, expéditeurs actifs : 1/2. Les e-mails partent de gladys@example.com.',
  );

  const nothing = await gladys.fake.action('send_test', {});
  assert.match(messageOf(nothing).en, /Enter an email address/);
  const wrong = await gladys.fake.action('send_test', { email: 'nope', phone_number: 'hello' });
  assert.match(
    messageOf(wrong).en,
    /“nope” is not an email address\. “hello” is not a phone number/,
  );
  assert.equal(brevo.sentEmails().length + brevo.sentSms().length, 0);

  const sent = await gladys.fake.action('send_test', {
    email: 'alice@example.com',
    phone_number: '+33 6 12 34 56 78',
  });
  assert.equal(
    messageOf(sent).fr,
    'E-mail de test envoyé à a***@example.com. SMS de test envoyé au +336******78.',
  );
  assert.equal(brevo.sentSms()[0].content, TEST_MESSAGE);
  for (const [language, text] of Object.entries(messageOf(sent))) {
    assert.ok(text.length <= 200, language);
  }
});

test('both widgets are valid in every language, and never cost a Brevo call', async () => {
  const { gladys, brevo } = await start({
    brevo: { sms: [{ status: 400, body: { code: 'not_enough_credits', message: 'x' } }] },
  });
  for (const language of ['en', 'fr', 'de', 'es']) {
    const empty = await gladys.fake.widgetGet('activity', { language });
    assert.deepEqual(validateWidgetContent(empty.data.content), [], `empty activity ${language}`);
  }
  await gladys.fake.sendMessage(EMAIL_CONTACT, MESSAGE);
  await gladys.fake.sendMessage(SMS_CONTACT, MESSAGE);
  const before = brevo.calls.length;
  for (const key of ['account', 'activity']) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const ack = await gladys.fake.widgetGet(key, { language });
      assert.equal(ack.success, true, `${key} ${language}`);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
  assert.equal(brevo.calls.length, before);
  const activity = (await gladys.fake.widgetGet('activity', { language: 'en' })).data.content;
  const items = activity.components.find((component) => component.type === 'card-list').items;
  assert.deepEqual(
    items.map((item) => item.badge),
    [
      { text: 'not sent', color: 'danger' },
      { text: 'sent', color: 'info' },
    ],
  );
  const account = (await gladys.fake.widgetGet('account', { language: 'en' })).data.content;
  const rows = account.components.find((component) => component.type === 'status').items;
  assert.ok(
    rows.some((row) => row.label.startsWith('Last failure') && row.value === 'not enough credits'),
  );
});

test('the account widget before the first reading, and with a refused key', async () => {
  const brevo = createFakeBrevo();
  const gladys = createFakeGladys({ config: { api_key: 'xkeysib-revoked' } });
  createApp(gladys, {
    transport: brevo.transport,
    statePath: '/nonexistent/x.json',
    timers: false,
  });
  await gladys.connect();
  const ack = await gladys.fake.widgetGet('account', { language: 'fr' });
  const rows = ack.data.content.components.find((component) => component.type === 'status').items;
  assert.equal(rows[0].value, 'clé API refusée');
});

test('a new configuration: the sender is resolved again, the threshold compared again', async () => {
  const { gladys, app, brevo } = await start();
  assert.equal(app.brevo.sender().email, 'gladys@example.com');
  await gladys.fake.configUpdated({ ...KEYS, sender_email: 'alerts@example.com' });
  assert.equal(app.brevo.sender().email, 'alerts@example.com');
  assert.equal(app.getConfig().senderEmail, 'alerts@example.com');
  assert.ok(brevo.calls.some((call) => call.path === '/account'));
});

test('the state file holds counters and masked recipients only', async () => {
  const { gladys, app, statePath } = await start();
  await gladys.fake.sendMessage(BOTH_CONTACT, MESSAGE);
  await app.store.flush();
  const text = await readFile(statePath, 'utf8');
  assert.doesNotMatch(text, /alice@example\.com|612345678/);
  assert.match(text, /a\*\*\*@example\.com/);
});
