import type { Recipe, ScanProfile } from './types.ts';
import { ScannerError } from './errors.ts';

export const SCAN_PROFILES = [
  { id: 'auto', label: 'Auto', enhancement: 'auto' },
  { id: 'photo', label: 'Foto', enhancement: 'none' },
  { id: 'color', label: 'Farbe', enhancement: 'paper' },
  { id: 'grayscale', label: 'Graustufen', enhancement: 'grayscale' },
  { id: 'bw', label: 'Schwarz-Weiß', enhancement: 'bw' },
] as const;
export const validProfile = (value: unknown): value is ScanProfile =>
  SCAN_PROFILES.some((p) => p.id === value);

export function initialProfile(configured?: ScanProfile, requested?: ScanProfile): ScanProfile {
  for (const value of [configured, requested])
    if (value !== undefined && !validProfile(value))
      throw new ScannerError('CONFIG_INVALID', 'Ungültiges Startprofil.');
  return requested ?? configured ?? 'auto';
}

export function profileRecipe(profile: ScanProfile): Recipe {
  return {
    version: 1,
    enhancement: SCAN_PROFILES.find((p) => p.id === profile)!.enhancement,
    dewarp: profile === 'auto' ? 'auto' : 'off',
  };
}
