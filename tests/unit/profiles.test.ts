import test from 'node:test';
import assert from 'node:assert/strict';
import { initialProfile, profileRecipe } from '../../packages/scanner/src/profiles.ts';
test('initial profile uses per-open override, controller default, then auto', () => {
  assert.equal(initialProfile(), 'auto');
  assert.equal(initialProfile('photo'), 'photo');
  assert.equal(initialProfile('photo', 'bw'), 'bw');
  assert.equal(initialProfile('photo', 'auto'), 'auto');
  assert.equal(profileRecipe('color').enhancement, 'paper');
  assert.deepEqual(profileRecipe(initialProfile()), {
    version: 1,
    enhancement: 'auto',
    dewarp: 'auto',
  });
});
test('invalid initial profiles are rejected instead of silently replacing the default', () => {
  for (const value of ['document', '', null, 7]) {
    assert.throws(() => initialProfile(value as any));
    assert.throws(() => initialProfile(undefined, value as any));
  }
  assert.equal(profileRecipe('photo').enhancement, 'none');
});
