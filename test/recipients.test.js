import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePhone,
  normalizeEmail,
  parsePhoneList,
  parseEmailList,
  maskPhone,
  maskEmail,
  maskRecipient,
} from '../src/recipients.js';
import { contactTargets, normalizeConfig } from '../src/config.js';

test('phone numbers: the ways people write them, in international format', () => {
  assert.equal(normalizePhone('06 12 34 56 78', '33'), '+33612345678');
  assert.equal(normalizePhone('+33 (0)6 12-34-56-78', '33'), '+33612345678');
  assert.equal(normalizePhone('0033.6.12.34.56.78', '33'), '+33612345678');
  assert.equal(normalizePhone('0470 12 34 56', '32'), '+32470123456');
  assert.equal(normalizePhone('+4915112345678', '33'), '+4915112345678');
  assert.equal(normalizePhone('612345678', '33'), null, 'national without the trunk 0');
  assert.equal(normalizePhone('hello', '33'), null);
  assert.equal(normalizePhone('+12', '33'), null, 'too short');
  assert.equal(normalizePhone(undefined, '33'), null);
});

test('email addresses: a light check, the domain in lower case', () => {
  assert.equal(normalizeEmail(' Alice@Example.COM '), 'Alice@example.com');
  assert.equal(normalizeEmail('first.last+tag@sub.example.fr'), 'first.last+tag@sub.example.fr');
  for (const wrong of [
    'alice',
    'alice@',
    '@example.com',
    'a b@example.com',
    'a@example',
    'a@b.c',
  ]) {
    assert.equal(normalizeEmail(wrong), null, wrong);
  }
  assert.equal(normalizeEmail(`${'a'.repeat(250)}@example.com`), null, 'too long');
});

test('lists: commas, semicolons or lines, duplicates dropped, refused ones kept apart', () => {
  assert.deepEqual(parsePhoneList('06 12 34 56 78, +33612345678; nope\n+32470123456', '33'), {
    valid: ['+33612345678', '+32470123456'],
    invalid: ['nope'],
  });
  assert.deepEqual(parseEmailList('a@example.com; A@EXAMPLE.com, bad'), {
    valid: ['a@example.com'],
    invalid: ['bad'],
  });
  assert.deepEqual(parseEmailList(undefined), { valid: [], invalid: [] });
});

test('masks: enough to tell recipients apart, not to write to them', () => {
  assert.equal(maskPhone('+33612345678'), '+336******78');
  assert.equal(maskPhone('123'), '****');
  assert.equal(maskEmail('alice@example.com'), 'a***@example.com');
  assert.equal(maskEmail('nope'), '***');
  assert.equal(maskRecipient('bob@example.org'), 'b***@example.org');
  assert.equal(maskRecipient('+33612345678'), '+336******78');
});

test('contactTargets: the channel of the user, email by default', () => {
  assert.deepEqual(contactTargets({ email: 'a@example.com' }, '33'), [
    { channel: 'email', recipient: 'a@example.com', typed: 'a@example.com' },
  ]);
  assert.deepEqual(contactTargets({ channel: 'sms', phone_number: '06 12 34 56 78' }, '33'), [
    { channel: 'sms', recipient: '+33612345678', typed: '06 12 34 56 78' },
  ]);
  const both = contactTargets({ channel: 'both', email: 'bad', phone_number: '' }, '33');
  assert.deepEqual(
    both.map((target) => [target.channel, target.recipient]),
    [
      ['email', null],
      ['sms', null],
    ],
  );
  assert.equal(contactTargets({ channel: 'pigeon' })[0].channel, 'email');
});

test('normalizeConfig: defaults, cleaned values', () => {
  const config = normalizeConfig({});
  assert.equal(config.apiKey, '');
  assert.equal(config.senderEmail, '');
  assert.equal(config.senderName, 'Gladys');
  assert.equal(config.subjectPrefix, 'Gladys');
  assert.equal(config.smsSender, 'Gladys');
  assert.equal(config.countryCode, '33');
  assert.equal(config.lowCreditsThreshold, 20);
  assert.equal(config.followDeliveries, true);
  const typed = normalizeConfig({
    api_key: ' xkeysib-x ',
    sender_email: 'not an address',
    sms_sender: ' Ma Maison ',
    country_code: '+32',
    low_credits_threshold: '-5',
    follow_deliveries: 'false',
  });
  assert.equal(typed.apiKey, 'xkeysib-x');
  assert.equal(typed.senderEmail, 'not an address', 'kept: Brevo names the problem');
  assert.equal(typed.smsSender, 'MaMaison');
  assert.equal(typed.countryCode, '32');
  assert.equal(typed.lowCreditsThreshold, 0);
  assert.equal(typed.followDeliveries, false);
});
