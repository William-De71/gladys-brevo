import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { SCENE_TRIGGERS } from '../src/events.js';
import { SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { FAILURE_REASONS, DELIVERY_FAILURES } from '../src/brevo.js';
import {
  DEFAULT_COUNTRY_CODE,
  DEFAULT_LOW_CREDITS,
  DEFAULT_SMS_SENDER,
  CONTACT_CHANNELS,
} from '../src/config.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a send-only communication channel, in lockstep with package.json, at 0.x', () => {
  assert.equal(manifest.type, 'communication');
  assert.deepEqual(manifest.messaging, { receive: false });
  assert.equal(manifest.name, 'Brevo');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-brevo:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-brevo/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-brevo');
  // A send-only channel never talks to the brain.
  assert.doesNotMatch(source('../src/app.js'), /publishMessage|linkContact/);
});

test('declares the cloud transport only: the Brevo API', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
});

test('requires the Gladys of the catalog fields (5.3.0); no extra permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['notifications']);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  // No widget button with a form: those need Gladys 5.2.0.
  assert.doesNotMatch(source('../src/widgets.js'), /fields:/);
});

test('declares exactly the scene triggers, actions, widgets and buttons the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
});

test('mirrors the values of the code', () => {
  const config = byKey(manifest.config_schema);
  assert.equal(config.get('api_key').type, 'secret');
  assert.equal(config.get('country_code').default, DEFAULT_COUNTRY_CODE);
  assert.equal(config.get('low_credits_threshold').default, DEFAULT_LOW_CREDITS);
  assert.equal(config.get('sms_sender').default, DEFAULT_SMS_SENDER);
  assert.equal(config.get('follow_deliveries').default, true);
  const triggers = byKey(manifest.scene_triggers);
  const notSent = byKey(triggers.get('message_not_sent').fields);
  assert.deepEqual(values(notSent.get('reason')).sort(), Object.values(FAILURE_REASONS).sort());
  assert.deepEqual(values(notSent.get('channel')), ['email', 'sms']);
  const failed = byKey(triggers.get('delivery_failed').fields);
  assert.deepEqual(values(failed.get('event')).sort(), Object.values(DELIVERY_FAILURES).sort());
  assert.deepEqual(values(failed.get('channel')), ['email', 'sms']);
  // The only links are the Brevo app and help pages.
  for (const link of config.get('intro').links) {
    assert.match(link.url, /^https:\/\/(app|help|onboarding)\.brevo\.com\//, link.url);
  }
});

test('the per-user block: the channel, an address, a number, never a secret', () => {
  const contact = manifest.contact_schema.filter((field) => field.type !== 'section');
  assert.deepEqual(
    contact.map((field) => [field.key, field.type, field.required ?? false]),
    [
      ['channel', 'select', true],
      ['email', 'string', false],
      ['phone_number', 'string', false],
    ],
  );
  const channel = contact[0];
  assert.deepEqual(values(channel), Object.values(CONTACT_CHANNELS));
  assert.equal(channel.default, CONTACT_CHANNELS.EMAIL);
});

test('limits of the store: counts, timeouts, sizes', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  assert.ok(manifest.actions.length <= 10);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
    for (const field of trigger.fields ?? []) {
      assert.ok(['string', 'number', 'select', 'multi_select'].includes(field.type), field.key);
    }
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok(
      (action.fields ?? []).length <= 10 && (action.outputs ?? []).length <= 20,
      action.key,
    );
  }
  // The store refuses a manifest of 100 KB or more.
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  // The cover: 800 x 534 JPEG under 150 KB (dimensions checked in i18n.test.js).
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('catalog fields of Gladys 5.3: search keywords and countries', () => {
  assert.ok(Array.isArray(manifest.keywords), 'keywords is a list');
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10, '1 to 10 keywords');
  for (const keyword of manifest.keywords) {
    assert.ok(
      keyword.trim().length >= 2 && keyword.trim().length <= 30,
      `"${keyword}": 2 to 30 chars`,
    );
  }
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'keywords are unique');
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'the name is already searched');
  // Usable anywhere: no country restriction.
  assert.equal(manifest.countries, undefined);
});
