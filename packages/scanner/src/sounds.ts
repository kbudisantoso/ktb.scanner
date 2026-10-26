import { ScannerError } from './errors.ts';

/** CC0 capture cues shipped locally. Hosts may present their own labels. */
export const SHUTTER_SOUNDS = [
  { id: 'off', label: 'No sound', file: null },
  { id: 'camera', label: 'Sharp click', file: 'shutter.mp3' },
  { id: 'reflex', label: 'Reflex click', file: 'reflex.mp3' },
] as const;
export type ShutterSoundId = (typeof SHUTTER_SOUNDS)[number]['id'];

/** Resolve configured audio without accessing browser globals or opening audio. */
export function resolveShutterSoundUrl(options: {
  assetBaseUrl: string;
  shutterSound?: ShutterSoundId;
  shutterSoundUrl?: string;
}): string | null {
  const id = options.shutterSound === undefined ? 'camera' : options.shutterSound;
  const sound = SHUTTER_SOUNDS.find((entry) => entry.id === id);
  if (!sound) throw new ScannerError('CONFIG_INVALID', 'Ungültiger Aufnahmeton.');
  if (options.shutterSoundUrl !== undefined) {
    try {
      if (typeof options.shutterSoundUrl !== 'string' || !options.shutterSoundUrl.trim())
        throw new Error('Missing sound URL');
      const url = new URL(options.shutterSoundUrl, 'https://scanner.invalid/');
      if (!['http:', 'https:', 'blob:'].includes(url.protocol)) throw new Error('Invalid protocol');
    } catch {
      throw new ScannerError('CONFIG_INVALID', 'Ungültige URL für den Aufnahmeton.');
    }
  }
  if (id === 'off') return null;
  return options.shutterSoundUrl ?? `${options.assetBaseUrl.replace(/\/$/, '')}/${sound.file}`;
}
