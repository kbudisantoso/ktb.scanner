import { useEffect, useId, useRef, useState } from 'react';
import type { PageDraft, Rotation, FormatSelection } from '../types.ts';
import type { Translate } from './hooks.ts';
import { PAPER, cropSize, layoutMm } from '../geometry.ts';
import { SCAN_PROFILES } from '../profiles.ts';
import { NEUTRAL_ADJUSTMENTS } from '../adjustments.ts';
import { ImageControls } from './ImageControls.tsx';
import { ToolIcon } from './ToolIcon.tsx';

export type ReviewPanel = 'filter' | 'adjust' | 'format' | 'quality' | 'original';
export const REVIEW_TITLES = {
  filter: 'Filter',
  adjust: 'Anpassen',
  format: 'Format',
  quality: 'Hinweise',
  original: 'Original',
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
  undo,
  canUndo,
  discard,
  repeat,
}: {
  draft: PageDraft;
  busy: boolean;
  t: Translate;
  change: (patch: Partial<PageDraft>) => void;
  layout: (format: FormatSelection) => void;
  corners: () => void;
  panel: ReviewPanel | null;
  setPanel: (panel: ReviewPanel | null) => void;
  undo: () => void;
  canUndo: boolean;
  discard: () => void;
  repeat: () => void;
}) {
  const [more, setMore] = useState(false);
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
  const count = reasons.length + Number(!!draft.edgesUncertain);
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
            <button className="scanner-repeat" disabled={busy} onClick={repeat}>
              {t('Wiederholen')}
            </button>
            <button
              disabled={busy}
              aria-label={t('Weitere Aktionen')}
              aria-expanded={more}
              onClick={() => setMore((value) => !value)}
            >
              <ToolIcon name="more" />
            </button>
            <button
              disabled={busy || !canUndo}
              aria-label={t('Rückgängig')}
              title={t('Rückgängig')}
              onClick={undo}
            >
              <ToolIcon name="reset" />
            </button>
            <button
              disabled={busy}
              data-review-tool="original"
              aria-label={t('Original vergleichen')}
              onClick={(e) => open('original')}
            >
              <ToolIcon name="source" />
            </button>
            {!!count && (
              <button
                disabled={busy}
                data-review-tool="quality"
                aria-label={t('Hinweise')}
                onClick={(e) => open('quality')}
                className="scanner-hints"
              >
                <ToolIcon name="info" />
                {count}
              </button>
            )}
          </div>
          {more && (
            <div className="scanner-review-menu">
              <button disabled={busy} aria-label={t('Aufnahme verwerfen')} onClick={discard}>
                {t('Verwerfen')}
              </button>
            </div>
          )}
          <div className="scanner-toolstrip" role="group" aria-label={t('Seite bearbeiten')}>
            <button disabled={busy} aria-label={t('Ecken korrigieren')} onClick={corners}>
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
              <button
                className="scanner-reset-edit"
                disabled={busy}
                aria-label={t('Optimierung zurücksetzen')}
                onClick={() =>
                  recipe({
                    version: 1,
                    enhancement: 'none',
                    dewarp: 'off',
                    adjustments: { ...NEUTRAL_ADJUSTMENTS },
                  })
                }
              >
                {t('Zurücksetzen')}
              </button>
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
