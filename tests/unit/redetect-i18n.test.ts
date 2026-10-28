import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../../packages/scanner/src/i18n.ts';

test('edge finding has English/German labels, recoverable feedback and host overrides', () => {
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
});
