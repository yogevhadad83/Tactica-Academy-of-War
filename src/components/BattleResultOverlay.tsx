import { useEffect, useMemo, useRef } from 'react';
import '../pages/BattleTheater.css';

interface BattleResultOverlayProps {
  open: boolean;
  status: 'victory' | 'defeat' | 'draw';
  winnerLabel?: string;
  matchId?: string;
  summaryLines?: string[];
  onAfterAction: () => void;
  onBack: () => void;
  onReplay?: () => void;
  forceFocus?: boolean;
  showAfterAction?: boolean;
  backLabel?: string;
}

const focusableSelector = [
  'button',
  '[href]',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const statusTitle = {
  victory: 'Victory',
  defeat: 'Defeat',
  draw: 'Stalemate'
} as const;

export const BattleResultOverlay = ({
  open,
  status,
  winnerLabel,
  matchId,
  summaryLines,
  onAfterAction,
  onBack,
  onReplay,
  forceFocus = true,
  showAfterAction = true,
  backLabel = 'Back to Academy',
}: BattleResultOverlayProps) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const toneClass = useMemo(() => {
    if (status === 'victory') return 'overlay-victory';
    if (status === 'defeat') return 'overlay-defeat';
    return 'overlay-draw';
  }, [status]);

  useEffect(() => {
    if (!open) return undefined;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    if (!forceFocus) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    const firstFocusable = focusables.find((el) => !el.hasAttribute('disabled')) ?? dialog;
    window.setTimeout(() => firstFocusable.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      if (focusables.length === 0) return;
      const focusedIndex = focusables.indexOf(document.activeElement as HTMLElement);
      let nextIndex = focusedIndex;
      if (event.shiftKey) {
        nextIndex = focusedIndex <= 0 ? focusables.length - 1 : focusedIndex - 1;
      } else {
        nextIndex = focusedIndex === focusables.length - 1 ? 0 : focusedIndex + 1;
      }
      event.preventDefault();
      focusables[nextIndex].focus();
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, forceFocus]);

  useEffect(() => {
    return () => {
      const last = lastFocusedRef.current;
      if (last) {
        last.focus();
      }
    };
  }, []);

  if (!open) return null;

  return (
    <div className="battle-overlay" role="dialog" aria-modal="true" aria-labelledby="battle-result-title">
      <div className={`battle-overlay__card ${toneClass}`} ref={dialogRef} tabIndex={-1}>
        <p className="overlay-kicker">Engagement Complete</p>
        <h2 id="battle-result-title">{statusTitle[status]}</h2>
        <p className="overlay-subtext">{winnerLabel ?? 'Outcome recorded.'}{matchId ? ` · Match ${matchId.slice(0, 8)}...` : ''}</p>

        {summaryLines && summaryLines.length > 0 && (
          <ul className="overlay-summary" aria-label="Battle summary">
            {summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        <div className="overlay-actions">
          {showAfterAction && (
            <button type="button" className="cta primary" onClick={onAfterAction} autoFocus>
              After-Action Report
            </button>
          )}
          <button type="button" className="cta secondary" onClick={onBack}>
            {backLabel}
          </button>
          {onReplay && (
            <button type="button" className="cta ghost" onClick={onReplay}>
              Replay from Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BattleResultOverlay;
