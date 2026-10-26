import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHUTTER_SOUNDS, resolveShutterSoundUrl } from '../../packages/scanner/src/sounds.ts';

test('the catalog offers silence and only the two bundled CC0 shutter cues', () => {
  assert.deepEqual(
    SHUTTER_SOUNDS.map((sound) => sound.id),
    ['off', 'camera', 'reflex'],
  );
  assert.equal(resolveShutterSoundUrl({ assetBaseUrl: '/assets/' }), '/assets/shutter.mp3');
  assert.equal(
    resolveShutterSoundUrl({ assetBaseUrl: '/assets', shutterSound: 'reflex' }),
    '/assets/reflex.mp3',
  );
});
test('a host-owned sound overrides a cue while explicit silence remains authoritative', () => {
  const options = { assetBaseUrl: '/assets', shutterSoundUrl: '/my-audio/capture.mp3' };
  assert.equal(resolveShutterSoundUrl(options), '/my-audio/capture.mp3');
  assert.equal(resolveShutterSoundUrl({ ...options, shutterSound: 'off' }), null);
});
test('invalid or retired selections and unsafe custom URLs fail before opening audio', () => {
  for (const shutterSound of ['deepscan', '', null, {}])
    assert.throws(
      () =>
        resolveShutterSoundUrl({ assetBaseUrl: '/assets', shutterSound: shutterSound as 'camera' }),
      { code: 'CONFIG_INVALID' },
    );
  for (const shutterSoundUrl of [
    '',
    'javascript:alert(1)',
    'file:///tmp/sound.mp3',
    'data:audio/mp3;base64,aA==',
    42,
  ])
    assert.throws(
      () =>
        resolveShutterSoundUrl({
          assetBaseUrl: '/assets',
          shutterSoundUrl: shutterSoundUrl as string,
        }),
      { code: 'CONFIG_INVALID' },
    );
});
