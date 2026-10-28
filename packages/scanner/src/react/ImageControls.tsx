import { useEffect, useId, useRef, useState } from 'react';
import type { AutoOptimization, LensCorrection, Recipe } from '../types.ts';
import { NEUTRAL_ADJUSTMENTS } from '../adjustments.ts';
import { ToolIcon } from './ToolIcon.tsx';

type ResetAction = {
  label: string;
  description: string;
  enabled: boolean;
  apply: () => void;
};
function ResetControl({
  action,
  disabled,
  prepare,
}: {
  action: ResetAction;
  disabled: boolean;
  prepare?: React.PointerEventHandler<HTMLButtonElement>;
}) {
  const description = useId();
  return (
    <>
      <button
        className="scanner-reset-control"
        disabled={disabled}
        aria-label={action.label}
        aria-describedby={description}
        onPointerDown={prepare}
        onClick={action.apply}
      >
        <ToolIcon name="reset" />
      </button>
      <span id={description} className="scanner-sr-only">
        {action.description}
      </span>
    </>
  );
}

export function RangeControl({
  label,
  value,
  min,
  max,
  disabled,
  apply,
  reset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  apply: (value: number) => void;
  reset: ResetAction;
}) {
  const id = useId();
  const [local, setLocal] = useState(value),
    pending = useRef<number | null>(null);
  useEffect(() => {
    if (!disabled) {
      setLocal(value);
      pending.current = null;
    }
  }, [value, disabled]);
  const commit = () => {
    if (pending.current !== null && !disabled) {
      const next = pending.current;
      pending.current = null;
      apply(next);
    }
  };
  return (
    <div className="scanner-range">
      <label htmlFor={id}>
        {label}
        <output htmlFor={id}>
          {local > 0 ? '+' : ''}
          {local}
        </output>
      </label>
      <input
        id={id}
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
      <ResetControl
        action={{
          ...reset,
          apply: () => {
            pending.current = null;
            setLocal(0);
            if (reset.enabled) reset.apply();
          },
        }}
        disabled={disabled || (!reset.enabled && local === 0)}
        prepare={(event) => event.preventDefault()}
      />
    </div>
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
  const resetNames = {
    brightness: 'Helligkeit zurücksetzen',
    contrast: 'Kontrast zurücksetzen',
    sharpness: 'Schärfe zurücksetzen',
    lens: 'Linse zurücksetzen',
  };
  const reset: ResetAction = {
    label: t(resetNames[active]),
    description: t(
      active === 'lens'
        ? 'Setzt die Linse auf Auto zurück und entfernt die manuelle Linsenstärke. Andere Einstellungen bleiben erhalten.'
        : 'Setzt nur diese Anpassung auf 0 zurück. Andere Einstellungen bleiben erhalten.',
    ),
    enabled:
      active === 'lens'
        ? recipe.dewarp !== 'auto' || recipe.lensStrength !== undefined
        : adjustments[active] !== 0,
    apply: () => {
      if (active === 'lens') {
        const next: Recipe = { ...recipe, dewarp: 'auto' };
        delete next.lensStrength;
        change(next);
      } else change({ ...recipe, adjustments: { ...adjustments, [active]: 0 } });
    },
  };
  return (
    <section className="scanner-image-controls" aria-label={t('Bild optimieren')}>
      <div className="scanner-segments" role="group" aria-label={t('Anpassung wählen')}>
        {(['brightness', 'contrast', 'sharpness', 'lens'] as const).map((key) => (
          <button
            key={key}
            disabled={busy}
            aria-pressed={active === key}
            onClick={() => setActive(key)}
          >
            {t(names[key])}
          </button>
        ))}
      </div>
      {active !== 'lens' ? (
        <RangeControl
          key={active}
          label={t(names[active])}
          value={adjustments[active]}
          min={active === 'sharpness' ? 0 : -100}
          max={100}
          disabled={busy}
          apply={(value) => change({ ...recipe, adjustments: { ...adjustments, [active]: value } })}
          reset={reset}
        />
      ) : (
        <>
          <div className="scanner-lens-row">
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
                        recipe.dewarp === 'auto'
                          ? (lens?.strength ?? 0)
                          : (recipe.lensStrength ?? 0),
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
            {recipe.dewarp !== 'manual' && (
              <ResetControl action={reset} disabled={busy || !reset.enabled} />
            )}
          </div>
          {recipe.dewarp === 'manual' && (
            <RangeControl
              key="lens"
              label={t('Linsenkorrektur')}
              value={Math.round((recipe.lensStrength ?? 0) / 0.0018)}
              min={-100}
              max={100}
              disabled={busy}
              apply={(value) => change({ ...recipe, lensStrength: value * 0.0018 })}
              reset={reset}
            />
          )}
        </>
      )}
    </section>
  );
}
