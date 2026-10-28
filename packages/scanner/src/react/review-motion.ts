import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type PageDirection = 'previous' | 'next';
export type ReviewTarget = { key: string | object; image?: Blob };
export type ReviewNavigation = {
  previous?: ReviewTarget;
  next?: ReviewTarget;
  navigate: (
    direction: PageDirection,
    target: ReviewTarget,
    leave: (savedKey: string) => Promise<'animate' | 'static' | false>,
    signal: AbortSignal,
  ) => Promise<{ key: string; image: Blob } | false>;
};
export type ReviewArrival = {
  token: number;
  direction: PageDirection;
  animate: boolean;
  ignoreUntil: number;
};
export type ReviewMotionOptions = {
  key: string;
  cancelKey: number;
  navigation?: ReviewNavigation;
  arrival?: ReviewArrival;
  arrived: (token: number) => void;
  signal: AbortSignal;
};
type Resource = {
  key: string | object;
  image: Blob;
  url: string;
  width: number;
  height: number;
  ready: boolean;
};
type Phase = 'idle' | 'dragging' | 'settling' | 'navigating' | 'entering';

/** Private review leases: the outgoing and one actual neighbour, never a raster copy. */
export function useReviewMotion(
  image: Blob,
  options: ReviewMotionOptions | undefined,
  size: { width: number; height: number },
  elements: {
    main: React.RefObject<HTMLImageElement | null>;
    next: React.RefObject<HTMLImageElement | null>;
  },
) {
  const inputs = useRef({ image, options, size });
  inputs.current = { image, options, size };
  const [, render] = useState(0);
  const alive = useRef(true),
    epoch = useRef(0);
  const main = useRef<Resource | undefined>(undefined),
    next = useRef<Resource | undefined>(undefined);
  const leases = useRef(new Set<Resource>());
  const phase = useRef<Phase>('idle'),
    offset = useRef(0),
    side = useRef(1);
  const direction = useRef<PageDirection | undefined>(undefined),
    target = useRef<ReviewTarget | undefined>(undefined);
  const allowed = useRef(new Set<string | object>());
  const operation = useRef<AbortController | undefined>(undefined);
  const animations = useRef(new Set<Animation>());
  const pending = useRef(new Set<(ok: boolean) => void>());
  const releaseCommit = useRef<((ok: boolean) => void) | undefined>(undefined);
  const consumedArrival = useRef<number | undefined>(undefined);
  const reduced = useRef(false),
    confirmed = useRef(false),
    staticCommit = useRef(false);
  const failedImage = useRef<Blob | undefined>(undefined);
  const update = () => {
    if (alive.current) render((value) => value + 1);
  };
  const release = (resource?: Resource) => {
    if (resource && leases.current.delete(resource)) URL.revokeObjectURL(resource.url);
  };
  const create = (blob: Blob, key: string | object): Resource => {
    const resource = {
      key,
      image: blob,
      url: URL.createObjectURL(blob),
      width: 0,
      height: 0,
      ready: false,
    };
    leases.current.add(resource);
    return resource;
  };
  const finishArrival = () => {
    const arrival = inputs.current.options?.arrival;
    if (arrival) {
      consumedArrival.current = arrival.token;
      inputs.current.options?.arrived(arrival.token);
    }
  };
  const sync = () => {
    const latest = inputs.current;
    if (
      !latest.options ||
      latest.options.signal.aborted ||
      !alive.current ||
      failedImage.current === latest.image
    )
      return;
    if (main.current?.key === latest.options.key && main.current.image === latest.image) return;
    release(main.current);
    main.current = create(latest.image, latest.options.key);
  };
  const cancel = (restore = true) => {
    epoch.current++;
    operation.current?.abort();
    operation.current = undefined;
    for (const animation of animations.current) animation.cancel();
    animations.current.clear();
    for (const done of pending.current) done(false);
    pending.current.clear();
    releaseCommit.current?.(false);
    releaseCommit.current = undefined;
    release(next.current);
    next.current = undefined;
    offset.current = 0;
    side.current = 1;
    target.current = undefined;
    direction.current = undefined;
    phase.current = 'idle';
    finishArrival();
    if (restore) sync();
    update();
  };
  const waitReady = (resource: Resource): Promise<boolean> => {
    if (resource.ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => done(false), 2000);
      const done = (ok: boolean) => {
        clearTimeout(timer);
        pending.current.delete(done);
        resolve(ok && resource.ready);
      };
      pending.current.add(done);
    });
  };
  const animate = async (mainTo: number, nextTo: number, ticket: number) => {
    if (reduced.current) {
      offset.current = mainTo;
      update();
      return ticket === epoch.current;
    }
    const list: Animation[] = [];
    for (const [element, from, to] of [
      [elements.main.current, offset.current, mainTo],
      [elements.next.current, offset.current + side.current * inputs.current.size.width, nextTo],
    ] as const) {
      if (!element) continue;
      const animation = element.animate(
        [{ translate: `${from}px 0` }, { translate: `${to}px 0` }],
        { duration: 190, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' },
      );
      animations.current.add(animation);
      list.push(animation);
    }
    await Promise.all(list.map((animation) => animation.finished.catch(() => {})));
    if (ticket !== epoch.current || !alive.current) return false;
    offset.current = mainTo;
    for (const [element, to] of [
      [elements.main.current, mainTo],
      [elements.next.current, nextTo],
    ] as const)
      if (element) element.style.translate = `${to}px 0`;
    for (const animation of list) {
      animation.cancel();
      animations.current.delete(animation);
    }
    update();
    return true;
  };
  const begin = () => {
    if (!inputs.current.options?.navigation || phase.current !== 'idle' || !main.current?.ready)
      return false;
    operation.current = new AbortController();
    allowed.current = new Set([inputs.current.options.key]);
    confirmed.current = staticCommit.current = false;
    phase.current = 'dragging';
    offset.current = 0;
    update();
    return true;
  };
  const move = (dx: number, dy: number) => {
    if (phase.current !== 'dragging') return;
    const which: PageDirection = dx < 0 ? 'next' : 'previous';
    const candidate =
      Math.abs(dx) > Math.abs(dy) * 1.5 ? inputs.current.options?.navigation?.[which] : undefined;
    if (target.current?.key !== candidate?.key || direction.current !== which) {
      release(next.current);
      next.current = undefined;
      target.current = candidate;
      direction.current = which;
      side.current = which === 'next' ? 1 : -1;
      if (candidate?.image) next.current = create(candidate.image, candidate.key);
    }
    offset.current = reduced.current
      ? 0
      : candidate
        ? Math.max(-inputs.current.size.width, Math.min(inputs.current.size.width, dx))
        : dx * 0.12;
    update();
  };
  const end = async (commit: boolean) => {
    if (phase.current !== 'dragging') return;
    const ticket = epoch.current;
    const activeOperation = operation.current;
    const destination = target.current,
      which = direction.current;
    if (!commit && !destination && Math.abs(offset.current) < 0.5) {
      cancel();
      return;
    }
    if (!commit || !destination || !which) {
      phase.current = 'settling';
      update();
      if (await animate(0, side.current * inputs.current.size.width, ticket)) cancel();
      return;
    }
    phase.current = 'settling';
    update();
    const neighbour = next.current;
    if (neighbour && !(await waitReady(neighbour))) {
      if (ticket === epoch.current) cancel();
      return;
    }
    if (ticket !== epoch.current || !operation.current) return;
    const navigate = inputs.current.options?.navigation?.navigate;
    if (!navigate) {
      cancel();
      return;
    }
    phase.current = 'navigating';
    update();
    let result: Awaited<ReturnType<ReviewNavigation['navigate']>>;
    try {
      result = await navigate(
        which,
        destination,
        async (savedKey) => {
          confirmed.current = true;
          allowed.current.add(savedKey);
          allowed.current.add(destination.key);
          const animated = await animate(-side.current * inputs.current.size.width, 0, ticket);
          if (!animated && !staticCommit.current) return false;
          if (!neighbour || staticCommit.current) {
            // Resolve only after React removes the outgoing decoder from the committed DOM.
            release(main.current);
            main.current = undefined;
            update();
            const committed = await new Promise<boolean>((resolve) => {
              releaseCommit.current = resolve;
              update();
            });
            if (!committed) return false;
          }
          return reduced.current || staticCommit.current ? 'static' : 'animate';
        },
        operation.current.signal,
      );
    } catch {
      result = false;
    }
    if (!alive.current || operation.current !== activeOperation || activeOperation?.signal.aborted)
      return;
    if (result && (staticCommit.current || (neighbour && leases.current.has(neighbour)))) {
      release(main.current);
      if (neighbour && leases.current.has(neighbour)) {
        neighbour.key = result.key;
        neighbour.image = result.image;
        main.current = neighbour;
      } else main.current = create(result.image, result.key);
      next.current = undefined;
      offset.current = 0;
      target.current = undefined;
      update();
    } else {
      phase.current = 'settling';
      update();
      if (await animate(0, side.current * inputs.current.size.width, epoch.current)) cancel();
    }
  };
  const loaded = (url: string, width: number, height: number) => {
    const resource = [...leases.current].find((value) => value.url === url);
    if (!resource || !alive.current) return;
    resource.width = width;
    resource.height = height;
    resource.ready = true;
    for (const done of [...pending.current]) done(true);
    update();
  };
  const failed = (url: string) => {
    if (![...leases.current].some((resource) => resource.url === url)) return;
    if (main.current?.url === url) {
      failedImage.current = main.current.image;
      release(main.current);
      main.current = undefined;
      cancel(false);
    } else cancel();
  };
  const stopVisual = () => {
    if (phase.current !== 'navigating' || !confirmed.current) {
      cancel();
      return;
    }
    staticCommit.current = true;
    epoch.current++;
    for (const animation of animations.current) animation.cancel();
    animations.current.clear();
    for (const done of pending.current) done(false);
    pending.current.clear();
    release(main.current);
    release(next.current);
    main.current = next.current = undefined;
    offset.current = 0;
    update();
  };
  useLayoutEffect(() => {
    alive.current = true;
    if (options) sync();
    update();
    return () => {
      alive.current = false;
      epoch.current++;
      operation.current?.abort();
      for (const animation of animations.current) animation.cancel();
      animations.current.clear();
      for (const done of pending.current) done(false);
      pending.current.clear();
      releaseCommit.current?.(false);
      for (const resource of leases.current) URL.revokeObjectURL(resource.url);
      leases.current.clear();
      main.current = next.current = undefined;
    };
  }, []);
  useLayoutEffect(() => {
    if (!options) return;
    const ownNavigation = phase.current === 'navigating' && allowed.current.has(options.key);
    if (
      !ownNavigation &&
      failedImage.current !== image &&
      (main.current?.key !== options.key || main.current?.image !== image)
    )
      cancel();
    if (
      phase.current === 'navigating' &&
      main.current?.key === options.key &&
      target.current === undefined
    ) {
      phase.current = 'idle';
      update();
    }
    if (
      !options.navigation &&
      (phase.current === 'dragging' || phase.current === 'settling') &&
      !confirmed.current
    )
      cancel();
    if (!main.current && releaseCommit.current) {
      const done = releaseCommit.current;
      releaseCommit.current = undefined;
      done(true);
    }
  });
  const previousCancelKey = useRef(options?.cancelKey);
  useLayoutEffect(() => {
    if (previousCancelKey.current !== options?.cancelKey) {
      previousCancelKey.current = options?.cancelKey;
      cancel();
    }
  }, [options?.cancelKey]);
  const previousSize = useRef(size);
  useLayoutEffect(() => {
    const previous = previousSize.current;
    previousSize.current = size;
    if (
      previous.width &&
      (previous.width !== size.width || previous.height !== size.height) &&
      phase.current !== 'idle'
    )
      stopVisual();
  }, [size.width, size.height]);
  useEffect(() => {
    if (!options) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    reduced.current = media.matches;
    const change = () => {
      reduced.current = media.matches;
      stopVisual();
    };
    media.addEventListener('change', change);
    const abort = () => {
      cancel(false);
      release(main.current);
      main.current = undefined;
      update();
    };
    options.signal.addEventListener('abort', abort, { once: true });
    return () => {
      media.removeEventListener('change', change);
      options.signal.removeEventListener('abort', abort);
    };
  }, [options?.signal]);
  useEffect(() => {
    const arrival = options?.arrival;
    if (
      !arrival ||
      consumedArrival.current === arrival.token ||
      !main.current?.ready ||
      !size.width ||
      phase.current !== 'idle'
    )
      return;
    consumedArrival.current = arrival.token;
    const ticket = epoch.current;
    side.current = arrival.direction === 'next' ? 1 : -1;
    offset.current = reduced.current || !arrival.animate ? 0 : side.current * size.width;
    phase.current = 'entering';
    update();
    // The owned image is already decoded; begin at its off-screen position before animating.
    if (elements.main.current) elements.main.current.style.translate = `${offset.current}px 0`;
    void (arrival.animate ? animate(0, 0, ticket) : Promise.resolve(true)).then((ok) => {
      if (ok) {
        phase.current = 'idle';
        update();
        inputs.current.options?.arrived(arrival.token);
      }
    });
  });
  return {
    main: main.current,
    next: next.current,
    phase: phase.current,
    offset: offset.current,
    nextOffset: offset.current + side.current * size.width,
    incoming: !!options?.arrival?.animate && consumedArrival.current !== options.arrival.token,
    idle: () => phase.current === 'idle',
    begin,
    move,
    end,
    cancel,
    loaded,
    failed,
  };
}
