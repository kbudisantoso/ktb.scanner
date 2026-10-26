# Capture sounds and custom audio

The shipped catalog contains exactly three choices. Both recordings are designated CC0-1.0 on their Freesound source pages, checked 26 October 2026. Audio stays local at runtime; no Freesound account, API key or external request is required by the scanner.

| ID | English / German label | Recording and credit |
| --- | --- | --- |
| `off` | No sound / Ohne Ton | No audio context, download or playback |
| `camera` (default) | Sharp click / Scharfer Klick | [Camera Shutter by roachpowder](https://freesound.org/people/roachpowder/sounds/170229/) |
| `reflex` | Reflex click / Reflex-Klick | [Pentax MZ-7 Shutter by AudioSea](https://freesound.org/people/AudioSea/sounds/645335/) |

CC0 permits copying, modification and redistribution, including commercial use, without a copyright attribution requirement. We voluntarily preserve the creator, title, source, retrieval date and SHA-256 in [shutter.NOTICE.txt](../packages/scanner/assets/shutter.NOTICE.txt) and [reflex.NOTICE.txt](../packages/scanner/assets/reflex.NOTICE.txt). The complete [CC0 legal text](../packages/scanner/assets/CC0-1.0.LICENSE) is distributed with the audio. CC0 does not imply creator endorsement or grant trademark rights.

The included files are the unchanged HQ MP3 previews publicly linked by Freesound. They are not the original AIFF/WAV downloads, which require a Freesound login. No credentials were needed to obtain these public MP3s. The product names are interface labels; the notices retain the original recording titles.

[Camera Shutter by NoTomorrow12](https://freesound.org/people/NoTomorrow12/sounds/832562/) is another checked CC0 candidate. It is not bundled: the later roachpowder suggestion replaced it as the preferred first sound.

## Select a bundled sound or silence

```ts
const scanner = createScanner({
  mount,
  assetBaseUrl: '/scanner-assets/',
  shutterSound: 'reflex', // 'camera' is the default; 'off' disables audio.
});
```

`SHUTTER_SOUNDS` and `ShutterSoundId` describe the bundled choices. The reference app uses this same catalog and supports muted automated preview tests. The retired Pixabay IDs are no longer valid configuration values.

## Use your own sound without changing the library

1. Obtain a short recording with suitable rights. Keep its creator, source, license and acquisition evidence. A free download or royalty-free label alone does not establish unrestricted redistribution rights.
2. Serve it from your host's own public directory, for example `public/sounds/capture.mp3`. Use a browser-supported audio format and a short clip suitable for immediate capture feedback.
3. Pass its URL when opening the scanner:

```ts
const scanner = createScanner({
  mount,
  assetBaseUrl: '/scanner-assets/',
  shutterSound: 'camera',
  shutterSoundUrl: '/sounds/capture.mp3',
});
```

`shutterSoundUrl` overrides the selected recording, while `shutterSound: 'off'` always wins and remains silent. It works with the controller and the reusable React `Scanner` through the same `options` object. It does not add another entry to the shipped catalog; a host can provide its own selector and labels.

Relative HTTP(S), absolute HTTP(S) and host-owned Blob URLs are accepted. Prefer same-origin delivery. An explicitly configured cross-origin URL needs CORS and an appropriate CSP `connect-src` because the recording is fetched for Web Audio decoding. There is no automatic CDN fallback. For a Blob URL, keep it valid for the session and revoke it after `destroy()` or component cleanup. Invalid URLs/schemes fail with `CONFIG_INVALID` before audio opens.

The sound is prepared following a user interaction and played when the frame is secured. Browser autoplay policy may still block playback; sound failure cannot delay or prevent capture. The custom URL is host configuration, not a destination for document uploads.

Do not place custom sounds inside the generated `public/scanner-assets/` directory: asset copying rebuilds that directory and removes retired files. Preserve your own audio notices in the host's license collection. The built-in CC0 notices describe only the two supplied recordings, not your replacement file.

## Extend the source catalog

For a deliberate library fork, add the licensed recording and a matching `*.NOTICE.txt` to `packages/scanner/assets/`, then add an ID/label/file entry in `src/sounds.ts` and its translation in `src/locales/en.ts`. Build and host copying discover current audio assets; they do not read local experiment directories. Update the explicit release/archive allowlist, attribution documentation and browser sound coverage when changing the shipped set, then run:

```sh
pnpm build
pnpm test:core
pnpm typecheck
pnpm lint
pnpm test
pnpm check:docs
pnpm check:notices
pnpm check:package
pnpm exec playwright test tests/browser/shutter.spec.ts tests/browser/notices.spec.ts
```

Tests mute physical output while exercising native audio decoding and playback timing.

## Ideas for additional sounds - not bundled

The following Pixabay links are inspiration for host-owned custom sounds. No files from these sources are shipped in the current source tree, package or built demos. Review the applicable [Pixabay terms](https://pixabay.com/service/terms/) for your intended use and redistribution; these suggestions are not CC0 claims or an endorsement by their creators.

| Idea | Creator / credited origin | Source |
| --- | --- | --- |
| iPhone Camera Capture | pooky1 (Freesound), uploaded by freesound_community | [Pixabay 6448](https://pixabay.com/sound-effects/film-special-effects-iphone-camera-capture-6448/) |
| DeepScan.mp3 | noirenex (Freesound), uploaded by freesound_community | [Pixabay 14662](https://pixabay.com/sound-effects/film-special-effects-deepscanmp3-14662/) |
| Sucking A Soul Out Of A Human | HiSound | [Pixabay 451533](https://pixabay.com/de/sound-effects/grusel-sucking-a-soul-out-of-a-human-451533/) |
| Incoming Notification | lucadialessandro | [Pixabay 547634](https://pixabay.com/de/sound-effects/technologie-incoming-notification-547634/) |
| Eingang Incoming Chat Xylophone | Johnny Weltraum (Freesound), uploaded by freesound_community | [Pixabay 86243](https://pixabay.com/de/sound-effects/film-spezialeffekte-eingang-incoming-chat-xylophone-86243/) |
| Incoming Text Beep | Virtual_Vibes | [Pixabay 464674](https://pixabay.com/de/sound-effects/technologie-incoming-text-beep-464674/) |
| Warp SFX | Breviceps (Freesound), uploaded by freesound_community | [Pixabay 6897](https://pixabay.com/de/sound-effects/film-spezialeffekte-warp-sfx-6897/) |
| Power Down | Rvgerxini (Freesound), uploaded by freesound_community | [Pixabay 42676](https://pixabay.com/de/sound-effects/film-spezialeffekte-power-down-42676/) |
| Instant Teleport | Chriddof (Freesound), uploaded by freesound_community | [Pixabay 90645](https://pixabay.com/de/sound-effects/film-spezialeffekte-instant-teleport-90645/) |
| Teleport Game Sound Effect | gargamel10 | [Pixabay 379236](https://pixabay.com/de/sound-effects/film-spezialeffekte-teleport-game-sound-effect-379236/) |
| transformers-sound | lolsuckmujuice (Freesound) | [Pixabay 43700](https://pixabay.com/de/sound-effects/film-spezialeffekte-transformers-sound-43700/) |
| Electric Boom 1 | AleXZavesa | [Pixabay 463651](https://pixabay.com/de/sound-effects/electric-boom-1-463651/) |

The previous downloads and acquisition notices are preserved only in ignored `local-assets/sounds/pixabay/`, with a checksum inventory. That directory is absent from clean clones and release archives and must remain outside build inputs. The removal changes the current tree and future artifacts; pre-existing Git history is not rewritten.
