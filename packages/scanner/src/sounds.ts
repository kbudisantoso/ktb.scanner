/** Locally shipped capture cues. Hosts may present their own labels. */
export const SHUTTER_SOUNDS = [
  { id: 'off', label: 'Ohne Ton', file: null },
  { id: 'camera', label: 'Scharfer Klick', file: 'shutter.mp3' },
  { id: 'deepscan', label: 'Scanpuls', file: 'deepscan.mp3' },
  { id: 'soul', label: 'Papiergeist', file: 'soul.mp3' },
  { id: 'notification', label: 'Frisch erfasst', file: 'notification.mp3' },
  { id: 'xylophone', label: 'Blattmusik', file: 'xylophone.mp3' },
  { id: 'beep', label: 'Alles im Kasten', file: 'beep.mp3' },
  { id: 'warp', label: 'Blattsprung', file: 'warp.mp3' },
  { id: 'powerdown', label: 'Feierabend', file: 'powerdown.mp3' },
  { id: 'instant', label: 'Blitzablage', file: 'instant.mp3' },
  { id: 'teleport', label: 'Durchs Scanportal', file: 'teleport.mp3' },
  { id: 'transformer', label: 'Scanformer', file: 'transformer.mp3' },
  { id: 'electric', label: 'Blattblitz', file: 'electric.mp3' },
] as const;
export type ShutterSoundId = (typeof SHUTTER_SOUNDS)[number]['id'];
