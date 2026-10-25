import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator, resolveLocale } from '../../packages/scanner/src/i18n.ts';
import { ScannerError, errorMessage } from '../../packages/scanner/src/errors.ts';

test('English is the library default; German and host overrides retain stable message keys', () => {
  assert.equal(resolveLocale(), 'en');
  assert.equal(createTranslator()('Dokument scannen'), 'Scan document');
  assert.equal(createTranslator('de')('Dokument scannen'), 'Dokument scannen');
  assert.equal(
    createTranslator('en', { 'Dokument scannen': 'Capture paperwork' })('Dokument scannen'),
    'Capture paperwork',
  );
  assert.equal(
    createTranslator('en', { 'Scan document': 'Capture paperwork' })('Dokument scannen'),
    'Capture paperwork',
  );
  assert.equal(createTranslator('en')('Seite {number}', { number: 12 }), 'Page 12');
  assert.equal(createTranslator('de')('Seite {number}', { number: 12 }), 'Seite 12');
  assert.equal(createTranslator()('External host label'), 'External host label');
});
test('stable error codes have English API messages and localized UI messages', () => {
  const error = new ScannerError(
    'CAMERA_UNAVAILABLE',
    'Die Kamera konnte nicht gestartet werden. Bitte Berechtigung prüfen oder Bilder importieren.',
  );
  assert.equal(error.code, 'CAMERA_UNAVAILABLE');
  assert.match(error.message, /^The camera could not start/);
  assert.match(createTranslator('de')(error.message), /^Die Kamera konnte/);
  assert.equal(
    errorMessage(new Error('untrusted internal detail')),
    'Processing failed. Try again.',
  );
  assert.equal(
    createTranslator('de')(errorMessage(new Error())),
    'Verarbeitung fehlgeschlagen. Bitte erneut versuchen.',
  );
});
test('unsupported locale fails explicitly rather than producing a mixed-language interface', () => {
  for (const value of ['fr', 'de-DE', '', null, 0])
    assert.throws(() => resolveLocale(value as 'en'), { code: 'CONFIG_INVALID' });
});
