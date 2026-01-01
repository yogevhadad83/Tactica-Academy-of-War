import { lazy, Suspense, useCallback, useState } from 'react';
import { BOARD_COLS, BOARD_SIZE } from '../engine/battleEngine';
import type { PlacedUnit } from '../types';
import type { PreviewChange } from '../hooks/useGameServer';
import '../pages/BoardView.css';

const ThreeBattleStage = lazy(() => import('./ThreeBattleStage'));

interface BattlePreviewProps {
  matchId: string;
  yourRole: 'A' | 'B';
  opponentName: string;
  yourBoard: PlacedUnit[];
  opponentBoard: PlacedUnit[];
  isYourTurn: boolean;
  onSendChange: (change: PreviewChange) => void;
}

type ChangeMode = null | 'move' | 'swap' | 'replace' | 'edit_behavior';

const BattlePreview = ({
  yourRole,
  opponentName,
  yourBoard,
  opponentBoard,
  isYourTurn,
  onSendChange,
}: BattlePreviewProps) => {
  const [changeMode, setChangeMode] = useState<ChangeMode>(null);
  const [selectedUnit, setSelectedUnit] = useState<PlacedUnit | null>(null);

  const boardSize = BOARD_SIZE;
  const boardCols = BOARD_COLS;

  const turn = yourRole === 'A' ? 'Challenger' : 'Defender';
  const turnStatus = isYourTurn ? `${turn}'s Turn — Make One Change` : `Waiting for ${opponentName}...`;

  const handleSwapUnits = useCallback(() => {
    // Simplified: just handle basic swap UI state
    // Full implementation would require unit selection and validation
    if (selectedUnit) {
      onSendChange({
        type: 'swap',
        unitInstanceId: selectedUnit.instanceId,
      });
    }
  }, [selectedUnit, onSendChange]);

  const handleCancelChange = useCallback(() => {
    setChangeMode(null);
    setSelectedUnit(null);
  }, []);

  return (
    <div className="battle-preview-container">
      <div className="preview-header">
        <h2>Battle Preview</h2>
        <p className="preview-status">{turnStatus}</p>
      </div>

      <div className="preview-boards-layout">
        {/* Your Board */}
        <div className="preview-board-section">
          <h3>Your Board</h3>
          <Suspense
            fallback={
              <div className="stage-loading" role="status" aria-live="polite">
                Loading your board…
              </div>
            }
          >
            <ThreeBattleStage
              boardSize={boardSize}
              boardCols={boardCols}
              units={yourBoard}
              hitCells={[]}
              hitEvents={[]}
              moveCells={[]}
              marchCells={[]}
              demoState="idle"
              interactionMode="preview"
              dragActive={false}
              forceOwner={yourRole === 'A' ? 'blue' : 'red'}
            />
          </Suspense>
        </div>

        {/* Opponent Board */}
        <div className="preview-board-section">
          <h3>{opponentName}'s Board</h3>
          <Suspense
            fallback={
              <div className="stage-loading" role="status" aria-live="polite">
                Loading opponent board…
              </div>
            }
          >
            <ThreeBattleStage
              boardSize={boardSize}
              boardCols={boardCols}
              units={opponentBoard}
              hitCells={[]}
              hitEvents={[]}
              moveCells={[]}
              marchCells={[]}
              demoState="idle"
              interactionMode="preview"
              dragActive={false}
              forceOwner={yourRole === 'A' ? 'red' : 'blue'}
            />
          </Suspense>
        </div>
      </div>

      {/* Change Panel */}
      {isYourTurn && (
        <div className="preview-change-panel">
          <h4>Make One Change</h4>

          {!changeMode ? (
            <div className="change-mode-buttons">
              <button
                type="button"
                className="change-btn"
                onClick={() => setChangeMode('move')}
              >
                Move Unit
              </button>
              <button
                type="button"
                className="change-btn"
                onClick={() => {
                  setChangeMode('swap');
                  handleSwapUnits();
                }}
              >
                Swap Positions
              </button>
              <button
                type="button"
                className="change-btn"
                onClick={() => setChangeMode('edit_behavior')}
              >
                Edit Behavior
              </button>
            </div>
          ) : (
            <div className="change-interaction">
              <p className="change-prompt">
                {changeMode === 'move' && 'Select a unit, then select destination tile'}
                {changeMode === 'swap' && 'Select two units to swap positions'}
                {changeMode === 'edit_behavior' && 'Select a unit to edit its behavior'}
              </p>
              {selectedUnit && (
                <div className="selected-unit-info">
                  <span>{selectedUnit.icon}</span>
                  <span>{selectedUnit.name}</span>
                </div>
              )}
              <button
                type="button"
                className="cancel-btn"
                onClick={handleCancelChange}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {!isYourTurn && (
        <div className="preview-waiting">
          <p>Waiting for {opponentName} to make their change...</p>
        </div>
      )}
    </div>
  );
};

export default BattlePreview;
