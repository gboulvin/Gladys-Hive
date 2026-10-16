// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store validator checks the manifest shape; only these tests know which
// handlers the code registers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { MANIFEST_ACTIONS } from '../src/actions.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { SCENE_TRIGGER_KEYS } from '../src/events.js';
import { createWidgets } from '../src/widgets.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const WIDGETS = createWidgets({});

const LANGUAGES = ['en', 'fr', 'de', 'es'];
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Every multi-language text of the manifest: any object carrying an `en` key.
function texts(node, path = '$', found = []) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => texts(item, `${path}[${i}]`, found));
  } else if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      found.push({ path, text: node });
    } else {
      for (const [key, value] of Object.entries(node)) {
        texts(value, `${path}.${key}`, found);
      }
    }
  }
  return found;
}

const allFields = [
  ...manifest.config_schema,
  ...[...manifest.actions, ...manifest.scene_triggers, ...manifest.scene_actions].flatMap(
    (item) => item.fields ?? [],
  ),
  ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
];

test('every text is translated in English, French, German and Spanish', () => {
  const all = texts(manifest);
  assert.ok(all.length > 50, `only ${all.length} texts found`);
  for (const { path, text } of all) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}`);
    for (const lang of LANGUAGES) {
      assert.ok(text[lang].trim().length > 0, `${path}.${lang} is empty`);
    }
  }
});

test('the user documentation exists in the four languages', async () => {
  for (const lang of LANGUAGES) {
    const doc = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    assert.ok(doc.length >= 300, `docs/${lang}.md is too short`);
  }
  await access(new URL('../cover.png', import.meta.url));
});

test('Hive is a cloud-only integration', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(MANIFEST_ACTIONS).sort());
});

test('every scene action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every scene trigger is fired by the code, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...SCENE_TRIGGER_KEYS].sort());
});

test('every widget has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const widget of manifest.widgets) {
    for (const [lang, label] of Object.entries(widget.label)) {
      assert.ok(label.length >= 3 && label.length <= 30, `widget label ${lang}`);
    }
    for (const [lang, text] of Object.entries(widget.description)) {
      assert.ok(text.length <= 100, `widget ${widget.key} description.${lang}`);
    }
  }
});

test('capability fields require Gladys >= 5.1.0', () => {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  const [major, minor] = match.slice(1).map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
    }
  }
  const secrets = manifest.config_schema.filter((field) => field.type === 'secret');
  assert.deepEqual(keysOf(secrets), ['password']);
  assert.equal(secrets[0].default, undefined, 'a secret has no default');
});

test('sections are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', field.key);
  }
});
