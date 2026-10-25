/** Locally shipped capture cues. Hosts may present their own labels. */
export const SHUTTER_SOUNDS = [
  { id: 'off', label: 'No sound', file: null },
  { id: 'camera', label: 'Sharp click', file: 'shutter.mp3' },
  { id: 'deepscan', label: 'Scan pulse', file: 'deepscan.mp3' },
  { id: 'soul', label: 'Paper ghost', file: 'soul.mp3' },
  { id: 'notification', label: 'Fresh capture', file: 'notification.mp3' },
  { id: 'xylophone', label: 'Paper chimes', file: 'xylophone.mp3' },
  { id: 'beep', label: 'All captured', file: 'beep.mp3' },
  { id: 'warp', label: 'Page jump', file: 'warp.mp3' },
  { id: 'powerdown', label: 'Signing off', file: 'powerdown.mp3' },
  { id: 'instant', label: 'Flash file', file: 'instant.mp3' },
  { id: 'teleport', label: 'Scan portal', file: 'teleport.mp3' },
  { id: 'transformer', label: 'Scanformer', file: 'transformer.mp3' },
  { id: 'electric', label: 'Paper spark', file: 'electric.mp3' },
] as const;
export type ShutterSoundId = (typeof SHUTTER_SOUNDS)[number]['id'];
