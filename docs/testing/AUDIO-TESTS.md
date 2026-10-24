# Sound tests without audible output

Browser specifications import `test`/`expect` from `tests/browser/fixtures.ts`. Its automatic fixture mutes media elements during real `play()` and routes real-time WebAudio destination connections through a zero-gain node. Offline audio is unchanged. This affects only test contexts, not library/reference behavior or system volume.

Native playback, MP3 requests, decoding, AudioBufferSourceNode.start(), media-time progress and cleanup still run. Sound tests also assert the muted output path. The separate product silence mode is tested for zero MP3 requests and no AudioContext. These checks do not establish speaker volume, perceived sound quality or physical iPhone audio permission.

```sh
pnpm exec playwright test tests/browser/shutter.spec.ts
```

New browser tests use the same fixture so additional audio flows remain physically silent.
