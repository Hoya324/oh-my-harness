import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, '..', 'docs');

// i18n.js is a browser script: `const translations = {...}` plus DOM helpers.
// Its only top-level side effect is one `document.addEventListener` call, so a
// minimal `document` stub lets us evaluate the file in Node and return the
// translations object without running any DOM code.
function loadTranslations() {
  const src = readFileSync(join(docsDir, 'i18n.js'), 'utf8');
  const documentStub = { addEventListener() {}, querySelectorAll() { return []; }, getElementById() { return null; }, documentElement: { setAttribute() {} } };
  const fn = new Function('document', 'window', src + '\nreturn translations;');
  return fn(documentStub, {});
}

function i18nKeysInHtml(file) {
  const html = readFileSync(join(docsDir, file), 'utf8');
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) keys.add(m[1]);
  return keys;
}

test('en and ko translation key sets are identical', () => {
  const t = loadTranslations();
  const en = Object.keys(t.en).sort();
  const ko = Object.keys(t.ko).sort();
  const missingInKo = en.filter((k) => !(k in t.ko));
  const missingInEn = ko.filter((k) => !(k in t.en));
  assert.deepEqual(missingInKo, [], `keys present in en but missing in ko: ${missingInKo.join(', ')}`);
  assert.deepEqual(missingInEn, [], `keys present in ko but missing in en: ${missingInEn.join(', ')}`);
  assert.deepEqual(en, ko);
});

test('every data-i18n key used in HTML exists in both languages', () => {
  const t = loadTranslations();
  const used = new Set([...i18nKeysInHtml('index.html'), ...i18nKeysInHtml('docs.html')]);
  const missing = [...used].filter((k) => !(k in t.en) || !(k in t.ko));
  assert.deepEqual(missing, [], `data-i18n keys referenced in HTML but missing from translations: ${missing.join(', ')}`);
  assert.ok(used.size > 0, 'expected at least one data-i18n key in the HTML');
});

test('no translation value is empty or whitespace-only', () => {
  const t = loadTranslations();
  for (const lang of ['en', 'ko']) {
    for (const [key, val] of Object.entries(t[lang])) {
      assert.equal(typeof val, 'string', `${lang}.${key} should be a string`);
      assert.ok(val.trim().length > 0, `${lang}.${key} is empty`);
    }
  }
});

test('the new pipeline replay keys are present in both languages', () => {
  const t = loadTranslations();
  for (let i = 1; i <= 10; i++) {
    const key = `index.pipeline.replay.m${i}`;
    assert.ok(key in t.en, `${key} missing in en`);
    assert.ok(key in t.ko, `${key} missing in ko`);
  }
  assert.ok('index.pipeline.replay.label' in t.en && 'index.pipeline.replay.label' in t.ko);
});
