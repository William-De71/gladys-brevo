// -----------------------------------------------------------------------------
// Non-regression of everything users store: every key of the manifest a
// scene, a widget, a saved configuration or a user's "My account" block
// refers to, and the values scenes filter on.
//
// test/fixtures/manifest.baseline.json was generated from version 0.1.0 (the
// first release). A failure here means existing users would lose a setting,
// their address or number, a scene or a widget: never update the baseline without
// a documented migration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baseline = read('./fixtures/manifest.baseline.json');
const manifest = read('../gladys-assistant-integration.json');

const keys = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list) => new Map((list ?? []).map((entry) => [entry.key, entry]));

test('stays a send-only communication channel', () => {
  assert.equal(manifest.type, baseline.type);
  assert.deepEqual(manifest.messaging, baseline.messaging);
});

test('no configuration or contact key disappears or changes type', () => {
  for (const block of ['config_schema', 'contact_schema']) {
    const current = byKey(manifest[block]);
    for (const { key, type } of baseline[block]) {
      assert.equal(current.get(key)?.type, type, `${block}.${key}`);
    }
  }
  const channel = byKey(manifest.contact_schema).get('channel');
  for (const value of baseline.contact_channels) {
    assert.ok(
      channel.options.some((option) => option.value === value),
      `contact channel: ${value}`,
    );
  }
});

test('no Configuration screen button disappears', () => {
  assert.deepEqual(
    keys(manifest.actions).filter((key) => baseline.actions.includes(key)),
    baseline.actions,
  );
});

test('scene triggers keep their keys, filters, options and variables', () => {
  const current = byKey(manifest.scene_triggers);
  for (const trigger of baseline.scene_triggers) {
    const now = current.get(trigger.key);
    assert.ok(now, `scene_triggers.${trigger.key}`);
    const fields = byKey(now.fields);
    for (const { key, type, options } of trigger.fields) {
      assert.equal(fields.get(key)?.type, type, `${trigger.key}.fields.${key}`);
      const values = (fields.get(key).options ?? []).map((option) => option.value);
      options.forEach((value) =>
        assert.ok(values.includes(value), `${trigger.key}.${key}: ${value}`),
      );
    }
    const variables = byKey(now.variables);
    for (const { key, type } of trigger.variables) {
      assert.equal(variables.get(key)?.type, type, `${trigger.key}.variables.${key}`);
    }
  }
});

test('scene actions keep their keys, fields and outputs', () => {
  const current = byKey(manifest.scene_actions);
  for (const action of baseline.scene_actions) {
    const now = current.get(action.key);
    assert.ok(now, `scene_actions.${action.key}`);
    action.fields.forEach((field) =>
      assert.ok(keys(now.fields).includes(field), `${action.key}.${field}`),
    );
    const outputs = byKey(now.outputs);
    for (const { key, type } of action.outputs) {
      assert.equal(outputs.get(key)?.type, type, `${action.key}.outputs.${key}`);
    }
    // A new required field without a default breaks the scenes using the action.
    for (const field of now.fields ?? []) {
      if (field.required && field.default === undefined) {
        assert.ok(
          action.fields.includes(field.key),
          `${action.key}.${field.key} is new and required`,
        );
      }
    }
  }
});

test('widgets keep their keys and settings', () => {
  const current = byKey(manifest.widgets);
  for (const widget of baseline.widgets) {
    const now = current.get(widget.key);
    assert.ok(now, `widgets.${widget.key}`);
    const settings = byKey(now.settings);
    widget.settings.forEach((key) => assert.ok(settings.has(key), `${widget.key}.${key}`));
  }
});
