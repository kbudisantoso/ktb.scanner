import { setTimeout as sleepFor } from 'node:timers/promises';
import { registryState } from './release-config.mjs';

/** Only a post-publication 404 is retryable. All other failures remain fail-closed. */
export async function checkRegistry(
  url,
  integrity,
  {
    requirePublished = false,
    fetch: request = globalThis.fetch,
    now = () => performance.now(),
    sleep = sleepFor,
  } = {},
) {
  const deadline = requirePublished ? now() + 300_000 : Infinity;
  const unavailable = () =>
    new Error('The expected package is not available from npm within 5 minutes');
  let delay = 5_000;
  while (true) {
    const remaining = Math.floor(deadline - now());
    if (remaining <= 0) throw unavailable();
    const response = await request(url, {
      signal: AbortSignal.timeout(Math.min(30_000, remaining)),
    });
    const metadata = response.status === 200 ? await response.json() : null;
    if (response.status !== 200) await response.body?.cancel();
    const state = registryState(response.status, metadata, integrity);
    if (!requirePublished) return state;
    if (now() >= deadline) throw unavailable();
    if (state === 'identical') return state;
    await sleep(Math.min(delay, deadline - now()));
    delay = Math.min(delay + 5_000, 15_000);
  }
}
