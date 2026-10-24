import { test as base, expect } from '@playwright/test';

/** Mute only physical output. Native decoding, scheduling and media time still run. */
export const test = base.extend<{ mutedOutput: void }>({
  mutedOutput: [
    async ({ context }, use) => {
      await context.addInitScript(() => {
        const state = { gains: [] as GainNode[] };
        Object.assign(window, { testMutedOutput: state });
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          this.muted = true;
          return play.call(this);
        };
        const connect = AudioNode.prototype.connect;
        const buses = new WeakMap<BaseAudioContext, GainNode>();
        AudioNode.prototype.connect = function (
          this: AudioNode,
          ...args: [AudioNode | AudioParam, number?, number?]
        ) {
          const target = args[0];
          if (
            target === this.context.destination &&
            !(this.context instanceof OfflineAudioContext)
          ) {
            let bus = buses.get(this.context);
            if (!bus) {
              bus = this.context.createGain();
              bus.gain.value = 0;
              Reflect.apply(connect, bus, [this.context.destination]);
              buses.set(this.context, bus);
              state.gains.push(bus);
            }
            Reflect.apply(connect, this, [bus, args[1] ?? 0, args[2] ?? 0]);
            return target;
          }
          return Reflect.apply(connect, this, args);
        } as AudioNode['connect'];
      });
      await use();
    },
    { auto: true },
  ],
});
export { expect };
