import { useEffect, useRef, useState } from 'react';
import type { AutoOptimization, LensCorrection, Recipe } from '../types.ts';
import { NEUTRAL_ADJUSTMENTS } from '../adjustments.ts';

export function RangeControl({
  label,
  value,
  min,
  max,
  disabled,
  apply,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  apply: (value: number) => void;
}) {
  const [local, setLocal] = useState(value),
    pending = useRef<number | null>(null);
  useEffect(() => {
    setLocal(value);
    pending.current = null;
  }, [value]);
  const commit = () => {
    if (pending.current !== null && !disabled) {
      const next = pending.current;
      pending.current = null;
      apply(next);
    }
  };
  return (
    <label className="scanner-range">
      <span>
        {label}
        <output>
          {local > 0 ? '+' : ''}
          {local}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step="1"
        value={local}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          setLocal(n);
          pending.current = n;
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}

export function ImageControls({
  recipe,
  autoOptimization,
  lens,
  busy,
  change,
  t,
}: {
  recipe: Recipe;
  autoOptimization?: AutoOptimization;
  lens?: LensCorrection;
  busy: boolean;
  change: (recipe: Recipe) => void;
  t: (key: string) => string;
}) {
  const adjustments = recipe.adjustments ?? autoOptimization?.adjustments ?? NEUTRAL_ADJUSTMENTS;
  const [active, setActive] = useState<'brightness' | 'contrast' | 'sharpness' | 'lens'>(
    'brightness',
  );
  const names = {
    brightness: 'Helligkeit',
    contrast: 'Kontrast',
    sharpness: 'Schärfe',
    lens: 'Linse',
  };
  return (
    <section className="scanner-image-controls" aria-label={t('Bild optimieren')}>
      <div className="scanner-segments" role="group" aria-label={t('Anpassung wählen')}>
        {(['brightness', 'contrast', 'sharpness', 'lens'] as const).map((key) => (
          <button key={key} aria-pressed={active === key} onClick={() => setActive(key)}>
            {t(names[key])}
          </button>
        ))}
      </div>
      {active !== 'lens' ? (
        <RangeControl
          label={t(names[active])}
          value={adjustments[active]}
          min={active === 'sharpness' ? 0 : -100}
          max={100}
          disabled={busy}
          apply={(value) => change({ ...recipe, adjustments: { ...adjustments, [active]: value } })}
        />
      ) : (
        <>
          <div
            className="scanner-segments scanner-lens-modes"
            role="group"
            aria-label={t('Linsenentzerrung')}
          >
            {(['off', 'auto', 'manual'] as const).map((mode) => (
              <button
                key={mode}
                disabled={busy}
                aria-pressed={recipe.dewarp === mode}
                onClick={() =>
                  change({
                    ...recipe,
                    dewarp: mode,
                    lensStrength:
                      recipe.dewarp === 'auto' ? (lens?.strength ?? 0) : (recipe.lensStrength ?? 0),
                  })
                }
              >
                {t(mode === 'off' ? 'Aus' : mode === 'auto' ? 'Auto' : 'Manuell')}
                {mode === 'auto' && recipe.dewarp === 'auto' && (
                  <small role="status">
                    {t(
                      lens?.status === 'applied'
                        ? 'Korrigiert'
                        : lens?.status === 'already-straight'
                          ? 'Bereits gerade'
                          : lens
                            ? 'Keine Korrektur'
                            : 'Wird geprüft',
                    )}
                  </small>
                )}
              </button>
            ))}
          </div>
          {recipe.dewarp === 'manual' && (
            <RangeControl
              label={t('Linsenkorrektur')}
              value={Math.round((recipe.lensStrength ?? 0) / 0.0018)}
              min={-100}
              max={100}
              disabled={busy}
              apply={(value) => change({ ...recipe, lensStrength: value * 0.0018 })}
            />
          )}
        </>
      )}
    </section>
  );
}
