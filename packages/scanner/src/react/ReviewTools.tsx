import { useEffect, useId, useRef } from 'react';
import type { PageDraft, Rotation, FormatSelection } from '../types.ts';
import type { Translate } from './hooks.ts';
import { PAPER, cropSize, layoutMm } from '../geometry.ts';
import { SCAN_PROFILES } from '../profiles.ts';
import { ImageControls } from './ImageControls.tsx';
import { ToolIcon } from './ToolIcon.tsx';

export type ReviewPanel = 'filter' | 'adjust' | 'format' | 'quality';
export const REVIEW_TITLES = {
  filter: 'Filter',
  adjust: 'Anpassen',
  format: 'Format',
  quality: 'Hinweise',
};
export function ReviewTools({
  draft,
  busy,
  t,
  change,
  layout,
  corners,
  panel,
  setPanel,
  discard,
  repeat,
  add,
}: {
  draft: PageDraft;
  busy: boolean;
  t: Translate;
  change: (patch: Partial<PageDraft>) => void;
  layout: (format: FormatSelection) => void;
  corners: () => void;
  panel: ReviewPanel | null;
  setPanel: (panel: ReviewPanel | null) => void;
  discard: () => void;
  repeat: (trigger: HTMLButtonElement) => void;
  add: () => void;
}) {
  const trigger = useRef<ReviewPanel | null>(null),
    root = useRef<HTMLElement>(null),
    id = useId();
  useEffect(() => {
    if (!panel && !busy && trigger.current) {
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-review-tool="${trigger.current}"]`)
        ?.focus();
      trigger.current = null;
    }
  }, [panel, busy]);
  const recipe = (value: PageDraft['recipe']) => change({ recipe: value });
  const automatic = () => recipe({ version: 1, enhancement: 'auto', dewarp: 'auto' });
  const reasons = draft.quality.reasons.filter((r) => r !== 'edges');
  const format = (value: string) => {
    const selected: FormatSelection =
      value === 'receipt'
        ? { kind: 'receipt', widthMm: 80, origin: 'user' }
        : value === 'original-ratio'
          ? { kind: 'original-ratio', origin: 'user' }
          : {
              kind: 'standard',
              preset: value as keyof typeof PAPER,
              origin: 'user',
              ...(draft.format.kind === 'standard' && draft.format.orientation
                ? { orientation: draft.format.orientation }
                : {}),
            };
    change({ format: selected });
  };
  const open = (value: ReviewPanel) => {
    trigger.current = value;
    setPanel(value);
  };
  return (
    <aside ref={root} className="scanner-review-tools">
      {!panel ? (
        <>
          <div className="scanner-review-quick">
            <button
              className="scanner-repeat"
              disabled={busy}
              onClick={(event) => repeat(event.currentTarget)}
            >
              {t(draft.source === 'file' ? 'Bild tauschen' : 'Wiederholen')}
            </button>
            <button
              disabled={busy}
              aria-label={t('Aufnahme verwerfen')}
              title={t('Verwerfen')}
              onClick={discard}
            >
              <ToolIcon name="trash" />
            </button>
            <button
              disabled={busy}
              aria-label={t('Weitere Seite')}
              title={t('Weitere Seite')}
              onClick={add}
            >
              <ToolIcon name="plus" />
            </button>
          </div>
          <div className="scanner-toolstrip" role="group" aria-label={t('Seite bearbeiten')}>
            <button
              disabled={busy}
              data-review-tool="corners"
              aria-label={t('Ecken korrigieren')}
              onClick={corners}
            >
              <ToolIcon name="crop" />
              {t('Ecken')}
            </button>
            <button
              disabled={busy}
              aria-label={t('90° drehen')}
              onClick={() => change({ rotation: ((draft.rotation + 90) % 360) as Rotation })}
            >
              <ToolIcon name="rotate" />
              {t('Drehen')}
            </button>
            {(['filter', 'adjust', 'format'] as const).map((key) => (
              <button
                key={key}
                disabled={busy}
                data-review-tool={key}
                aria-expanded={false}
                aria-controls={id}
                onClick={(e) => open(key)}
              >
                <ToolIcon name={key} />
                {t(REVIEW_TITLES[key])}
              </button>
            ))}
          </div>
        </>
      ) : (
        <section id={id} className="scanner-tool-panel" aria-label={t(REVIEW_TITLES[panel])}>
          {panel === 'filter' && (
            <>
              <div className="scanner-profile-buttons" role="group" aria-label={t('Bildprofil')}>
                {SCAN_PROFILES.map((p) => (
                  <button
                    key={p.id}
                    disabled={busy}
                    aria-label={t(p.label)}
                    aria-pressed={draft.recipe.enhancement === p.enhancement}
                    onClick={() =>
                      p.id === 'auto'
                        ? automatic()
                        : recipe({ ...draft.recipe, enhancement: p.enhancement })
                    }
                  >
                    <span
                      className={`scanner-profile-symbol scanner-profile-${p.id}`}
                      aria-hidden="true"
                    >
                      {p.id === 'auto' ? <ToolIcon name="auto" /> : 'Aa'}
                    </span>
                    {t(p.id === 'grayscale' ? 'Grau' : p.id === 'bw' ? 'S/W' : p.label)}
                    {p.id === 'auto' &&
                      draft.autoOptimization &&
                      draft.recipe.enhancement === 'auto' && (
                        <small>
                          {t(draft.autoOptimization.profile === 'color' ? 'Farbe' : 'Foto')}
                        </small>
                      )}
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === 'adjust' && (
            <ImageControls
              recipe={draft.recipe}
              autoOptimization={draft.autoOptimization}
              lens={draft.lensCorrection}
              busy={busy}
              change={recipe}
              t={t}
            />
          )}
          {panel === 'format' && (
            <>
              <div className="scanner-format-grid" role="group" aria-label={t('Ausgabeformat')}>
                {[...Object.keys(PAPER), 'receipt', 'original-ratio'].map((p) => (
                  <button
                    key={p}
                    disabled={busy}
                    aria-label={t(
                      p === 'postcard-100x150'
                        ? 'Postkarte 10 × 15 cm'
                        : p === 'receipt'
                          ? 'Bon'
                          : p === 'original-ratio'
                            ? 'Originalverhältnis'
                            : p === 'letter'
                              ? 'Letter'
                              : p,
                    )}
                    title={p === 'postcard-100x150' ? t('Postkarte 10 × 15 cm') : undefined}
                    aria-pressed={
                      (draft.format.kind === 'standard'
                        ? draft.format.preset
                        : draft.format.kind) === p
                    }
                    onClick={() => format(p)}
                  >
                    {p === 'postcard-100x150' ? (
                      <>
                        {t('Post-')}
                        <br />
                        {t('karte')}
                      </>
                    ) : (
                      t(
                        p === 'receipt'
                          ? 'Bon'
                          : p === 'original-ratio'
                            ? 'Original'
                            : p === 'letter'
                              ? 'Letter'
                              : p,
                      )
                    )}
                  </button>
                ))}
              </div>
              {draft.format.kind === 'standard' && (
                <div
                  className="scanner-segments scanner-orientation"
                  role="group"
                  aria-label={t('Papierausrichtung')}
                >
                  {(['portrait', 'landscape'] as const).map((orientation) => {
                    const output = layoutMm(
                        draft.format,
                        cropSize(draft.corners, draft.size),
                        draft.rotation,
                      ),
                      portrait = output.height >= output.width,
                      quarter = draft.rotation === 90 || draft.rotation === 270;
                    return (
                      <button
                        key={orientation}
                        disabled={busy}
                        aria-label={t(orientation === 'portrait' ? 'Hochformat' : 'Querformat')}
                        aria-pressed={orientation === 'portrait' ? portrait : !portrait}
                        onClick={() => {
                          if (draft.format.kind === 'standard')
                            change({
                              format: {
                                ...draft.format,
                                origin: 'user',
                                orientation: quarter
                                  ? orientation === 'portrait'
                                    ? 'landscape'
                                    : 'portrait'
                                  : orientation,
                              },
                            });
                        }}
                      >
                        <span
                          className={orientation === 'landscape' ? 'scanner-sheet-landscape' : ''}
                        >
                          <ToolIcon name="sheet" />
                        </span>
                        {t(orientation === 'portrait' ? 'Hoch' : 'Quer')}
                      </button>
                    );
                  })}
                </div>
              )}
              {draft.format.kind === 'receipt' && (
                <div className="scanner-receipt-width">
                  <label>
                    {t('Breite (mm)')}
                    <input
                      aria-label={t('Bonbreite in mm')}
                      type="number"
                      min="10"
                      max="5000"
                      value={draft.format.widthMm || ''}
                      disabled={busy}
                      onChange={(e) =>
                        layout({ kind: 'receipt', widthMm: Number(e.target.value), origin: 'user' })
                      }
                    />
                  </label>
                  <div className="scanner-segments">
                    {[58, 80, 112].map((widthMm) => (
                      <button
                        key={widthMm}
                        disabled={busy}
                        aria-pressed={
                          draft.format.kind === 'receipt' && draft.format.widthMm === widthMm
                        }
                        onClick={() => layout({ kind: 'receipt', widthMm, origin: 'user' })}
                      >
                        {widthMm} mm
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {panel === 'quality' && (
            <ul className="scanner-quality">
              {reasons.map((reason) => (
                <li key={reason}>
                  {t(
                    {
                      blur: 'Aufnahme wirkt unscharf.',
                      exposure: 'Beleuchtung prüfen.',
                      'insufficient-structure': 'Schärfe nicht sicher beurteilbar.',
                    }[reason],
                  )}
                </li>
              ))}
              {draft.edgesUncertain && <li>{t('Dokumentränder bitte manuell prüfen.')}</li>}
            </ul>
          )}
        </section>
      )}
    </aside>
  );
}
