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
  assert.equal(createTranslator('en')('Bild tauschen'), 'Replace image');
  assert.equal(createTranslator('de')('Bild tauschen'), 'Bild tauschen');
  for (const key of ['Bild tauschen', 'Replace image'])
    assert.equal(
      createTranslator('en', { [key]: 'Choose another image' })('Bild tauschen'),
      'Choose another image',
    );
  assert.equal(
    createTranslator('en', { Wiederholen: 'Take another photo' })('Wiederholen'),
    'Take another photo',
  );
  assert.equal(
    createTranslator('en', { Retake: 'Take another photo' })('Wiederholen'),
    'Take another photo',
  );
  const en = createTranslator('en');
  const de = createTranslator('de');
  assert.equal(en('Kanten finden'), 'Find edges');
  assert.equal(de('Kanten finden'), 'Kanten finden');
  assert.equal(en('Dokumentkanten werden gesucht...'), 'Finding document edges...');
  assert.equal(
    en('Keine Dokumentkanten gefunden. Die bisherige Auswahl bleibt erhalten.'),
    'No document edges found. Your current selection is unchanged.',
  );
  assert.equal(
    en('Kanten konnten nicht gefunden werden. Bitte erneut versuchen oder Ecken manuell setzen.'),
    'Could not find edges. Try again or adjust the corners manually.',
  );
  assert.equal(
    createTranslator('en', { 'Find edges': 'Detect again' })('Kanten finden'),
    'Detect again',
  );
  for (const [key, translation] of [
    ['Helligkeit zurücksetzen', 'Reset brightness'],
    ['Kontrast zurücksetzen', 'Reset contrast'],
    ['Schärfe zurücksetzen', 'Reset sharpness'],
    ['Linse zurücksetzen', 'Reset lens'],
  ]) {
    assert.equal(en(key), translation);
    assert.equal(de(key), key);
  }
  assert.equal(
    createTranslator('en', { 'Reset lens': 'Restore lens auto' })('Linse zurücksetzen'),
    'Restore lens auto',
  );
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
