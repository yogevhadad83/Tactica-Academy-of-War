import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { units } from '../data/units';
import {
  advanceBattleTick,
  initializeBattle,
  BOARD_SIZE,
  PLAYER_ZONE_START,
  buildEnemyArmy
} from '../engine/battleEngine';
import type { BattleState, Team } from '../engine/battleEngine';
import type { BoardPlacements, PlacedUnit, Position } from '../types';
import { useUser } from '../context/UserContext';
const ThreeBattleStage = lazy(() => import('../components/ThreeBattleStage'));
import type { DemoState, HitEvent } from '../types/battle';
import './BoardView.css';

// Turn duration must be longer than all animation durations to stay in sync:
// - Fight animation: 1550ms
// - Kill animation: 1800ms
// - Move animation: 780ms
// Using 2000ms ensures all animations complete before the next turn.
const DEMO_TICK_MS = 2000;

// QA: temporarily reduce enemy unit count to 1 for easier testing
const ENEMY_UNIT_COUNT = 1;

const generateRandomEnemyFormation = (count: number = ENEMY_UNIT_COUNT): Position[] => {
  const taken = new Set<string>();
  const formation: Position[] = [];
  while (formation.length < count) {
    const row = Math.floor(Math.random() * PLAYER_ZONE_START);
    const col = Math.floor(Math.random() * BOARD_SIZE);
    const key = `${row}-${col}`;
    if (taken.has(key)) {
      continue;
    }
    formation.push({ row, col });
    taken.add(key);
  }
  return formation;
};

const BoardView = () => {
  const { currentUser, updateBoardPlacements } = useUser();
  const currentUserId = currentUser?.id ?? null;
  const [placements, setPlacements] = useState<BoardPlacements>(currentUser?.boardPlacements ?? {});
  const [selectedCell, setSelectedCell] = useState<Position | null>(null);
  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [simulationUnits, setSimulationUnits] = useState<PlacedUnit[]>([]);
  const [hitCells, setHitCells] = useState<string[]>([]);
  const [hitEvents, setHitEvents] = useState<HitEvent[]>([]);
  const [moveCells, setMoveCells] = useState<string[]>([]);
  const [marchCells, setMarchCells] = useState<string[]>([]);
  const [winner, setWinner] = useState<'player' | 'enemy' | null>(null);
  const [currentTeam, setCurrentTeam] = useState<Team>('player');
  const [turnNumber, setTurnNumber] = useState(1);
  const [startingTeam, setStartingTeam] = useState<Team | null>(null);
  const battleStateRef = useRef<BattleState | null>(null);
  const [countdownValue, setCountdownValue] = useState<string | number | null>(null);
  const knightTemplate = units.find((unit) => unit.id === 'knight');
  const [enemyUnits, setEnemyUnits] = useState<PlacedUnit[]>(() =>
    knightTemplate ? buildEnemyArmy(knightTemplate, generateRandomEnemyFormation()) : []
  );
  const enemySeededRef = useRef(false);
  const [enemyPresets, setEnemyPresets] = useState<Position[][]>([]);
  const presetsLoadedRef = useRef(false);
  const countdownTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setPlacements(currentUser?.boardPlacements ?? {});
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    updateBoardPlacements(placements);
  }, [placements, currentUserId, updateBoardPlacements]);

  useEffect(() => {
    if (!knightTemplate || enemySeededRef.current) return;
    if (enemyUnits.length === 0) {
      setEnemyUnits(buildEnemyArmy(knightTemplate, generateRandomEnemyFormation()));
    }
    enemySeededRef.current = true;
  }, [knightTemplate, enemyUnits.length]);

  useEffect(() => {
    if (!knightTemplate || presetsLoadedRef.current || typeof window === 'undefined') return;
    const raw = window.localStorage.getItem('armoria_enemy_presets');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Position[][];
        setEnemyPresets(Array.isArray(parsed) ? parsed.slice(-5) : []);
      } catch {
        // ignore malformed presets
      }
    }
    presetsLoadedRef.current = true;
  }, [knightTemplate]);

  const placedUnits: PlacedUnit[] = useMemo(() => {
    if (!currentUser) return [];
    return currentUser.army
      .map((unit) => {
        const position = placements[unit.instanceId];
        if (!position) return null;
        return {
          ...unit,
          position,
          team: 'player' as const,
          currentHp: unit.hp
        };
      })
      .filter(Boolean) as PlacedUnit[];
  }, [currentUser, placements]);

  const queueUnits = useMemo(() => {
    if (!currentUser) return [];
    return currentUser.army.filter((unit) => !placements[unit.instanceId]);
  }, [currentUser, placements]);

  const idleUnits = useMemo(() => [...placedUnits, ...enemyUnits], [placedUnits, enemyUnits]);
  const activeUnits = demoState === 'idle' ? idleUnits : simulationUnits;

  const scatterEnemyUnits = useCallback(() => {
    if (!knightTemplate) return;
    const formation = generateRandomEnemyFormation(enemyUnits.length || ENEMY_UNIT_COUNT);
    setEnemyUnits(buildEnemyArmy(knightTemplate, formation));
  }, [knightTemplate, enemyUnits.length]);

  const moveEnemyUnit = useCallback((instanceId: string, position: Position) => {
    setEnemyUnits((prev) => {
      const target = prev.find((unit) => unit.instanceId === instanceId);
      if (!target) return prev;
      const filtered = prev.filter(
        (unit) =>
          !(unit.instanceId !== instanceId && unit.position.row === position.row && unit.position.col === position.col)
      );
      return filtered.map((unit) => (unit.instanceId === instanceId ? { ...unit, position } : unit));
    });
  }, []);

  const getUnitAt = useCallback(
    (row: number, col: number): PlacedUnit | undefined => {
      return activeUnits.find((unit) => unit.position.row === row && unit.position.col === col);
    },
    [activeUnits]
  );

  const handleCellClick = (row: number, col: number) => {
    setSelectedCell({ row, col });
  };

  const removePlacement = (instanceId: string) => {
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, instanceId: string, team: 'player' | 'enemy') => {
    event.dataTransfer.setData('text/plain', `${team}:${instanceId}`);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!currentUser || demoState !== 'idle') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, row: number, col: number) => {
    if (demoState !== 'idle') return;
    event.preventDefault();
    const payload = event.dataTransfer.getData('text/plain');
    if (!payload) return;
    const [team, instanceId] = payload.split(':');
    if (team === 'player') {
      if (!currentUser || row < PLAYER_ZONE_START) return;
      setPlacements((prev) => {
        const next = { ...prev };
        Object.entries(next).forEach(([key, position]) => {
          if (position.row === row && position.col === col) {
            delete next[key];
          }
        });
        next[instanceId] = { row, col };
        return next;
      });
    }
    if (team === 'enemy') {
      if (row >= PLAYER_ZONE_START) return;
      moveEnemyUnit(instanceId, { row, col });
    }
  };

  const renderCell = (row: number, col: number) => {
    const unit = getUnitAt(row, col);
    const isSelected = selectedCell?.row === row && selectedCell?.col === col;
    const isEnemyTerritory = row < PLAYER_ZONE_START;
    const territoryClass = isEnemyTerritory ? 'enemy-zone' : 'player-zone';
    const cellKey = `${row}-${col}`;
    const wasHit = hitCells.includes(cellKey);
    const wasMoved = moveCells.includes(cellKey);
    const wasMarch = marchCells.includes(cellKey);
    const allowPlacement = demoState === 'idle';
    const canDragUnit = allowPlacement && Boolean(unit);

    return (
      <div
        key={cellKey}
        className={`board-cell ${territoryClass} ${unit ? `has-unit ${unit.team}` : ''} ${isSelected ? 'selected' : ''} ${wasHit ? 'hit-cell' : ''} ${wasMoved ? 'move-cell' : ''} ${wasMarch ? 'march-cell' : ''}`}
        onClick={() => handleCellClick(row, col)}
        onDragOver={allowPlacement ? (event) => handleDragOver(event) : undefined}
        onDrop={allowPlacement ? (event) => handleDrop(event, row, col) : undefined}
      >
        <div className="cell-coords">{row},{col}</div>
        {unit && (
          <div
            className="unit-on-board"
            draggable={canDragUnit}
            onDragStart={canDragUnit ? (event) => handleDragStart(event, unit.instanceId, unit.team) : undefined}
          >
            <div className="unit-icon-board">{unit.icon}</div>
            <div className="unit-health-bar">
              <div
                className="health-fill"
                style={{ width: `${(((unit.currentHp ?? unit.hp) / unit.hp) * 100).toFixed(0)}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const selectedUnit = selectedCell ? getUnitAt(selectedCell.row, selectedCell.col) : null;

  const clearDemoHighlights = () => {
    setHitCells([]);
    setHitEvents([]);
    setMoveCells([]);
    setMarchCells([]);
  };

  const clearCountdownTimers = useCallback(() => {
    if (countdownTimeoutRef.current !== null) {
      window.clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
    setCountdownValue(null);
  }, []);

  const beginFlightCountdown = useCallback(() => {
    clearCountdownTimers();
    const sequence: (string | number)[] = [3, 2, 1, 'START'];
    let index = 0;

    const step = () => {
      setCountdownValue(sequence[index]);
      const isLast = index === sequence.length - 1;
      index += 1;
      countdownTimeoutRef.current = window.setTimeout(() => {
        if (isLast) {
          setCountdownValue(null);
          countdownTimeoutRef.current = null;
          setDemoState('running');
        } else {
          step();
        }
      }, isLast ? 650 : 900);
    };

    step();
  }, [clearCountdownTimers]);

  useEffect(() => () => clearCountdownTimers(), [clearCountdownTimers]);

  useEffect(() => {
    if (hitCells.length === 0 && moveCells.length === 0) return;
    const timeout = window.setTimeout(() => {
      clearDemoHighlights();
    }, 420);
    return () => window.clearTimeout(timeout);
  }, [hitCells, moveCells]);

  useEffect(() => {
    if (marchCells.length === 0) return;
    const timeout = window.setTimeout(() => setMarchCells([]), 320);
    return () => window.clearTimeout(timeout);
  }, [marchCells]);

  useEffect(() => {
    if (demoState !== 'running') return;
    const interval = window.setInterval(() => {
      const state = battleStateRef.current;
      if (!state) {
        return;
      }
      const {
        units: nextUnits,
        winner: matchWinner,
        hits,
        hitEvents: tickHitEvents,
        moves,
        currentTeam: nextTeam,
        turnNumber: nextTurn
      } = advanceBattleTick(state.units, state.currentTeam, state.turnNumber);

      battleStateRef.current = {
        units: nextUnits,
        currentTeam: nextTeam,
        turnNumber: nextTurn
      };

      setSimulationUnits(nextUnits);
      setHitCells(hits);
      setHitEvents(tickHitEvents);
      setMoveCells(moves);
      setMarchCells(moves.filter((_, index) => index % 2 === 0));
      setCurrentTeam(nextTeam);
      setTurnNumber(nextTurn);

      if (matchWinner) {
        setWinner(matchWinner);
        setDemoState('finished');
      }
    }, DEMO_TICK_MS);
    return () => window.clearInterval(interval);
  }, [demoState]);

  const startDemoFight = () => {
    if (!currentUser || placedUnits.length === 0 || enemyUnits.length === 0) return;

    const playerArmy = placedUnits.map((unit) => ({
      ...unit,
      position: { ...unit.position },
      currentHp: unit.hp
    }));

    const enemyArmy = enemyUnits.map((unit) => ({
      ...unit,
      position: { ...unit.position },
      currentHp: unit.hp
    }));

    // Initialize battle with lucky draw
    const initialState = initializeBattle([...playerArmy, ...enemyArmy]);
    battleStateRef.current = initialState;
    setSimulationUnits(initialState.units);
    setCurrentTeam(initialState.currentTeam);
    setTurnNumber(initialState.turnNumber);
    setStartingTeam(initialState.currentTeam);
    setWinner(null);
    clearDemoHighlights();
    clearCountdownTimers();
    setDemoState('countdown');
    beginFlightCountdown();
  };

  const exitDemoFight = () => {
    setDemoState('idle');
    setSimulationUnits([]);
    battleStateRef.current = null;
    setWinner(null);
    setCurrentTeam('player');
    setTurnNumber(1);
    setStartingTeam(null);
    clearDemoHighlights();
    clearCountdownTimers();
  };

  const canLaunchDemo = demoState === 'idle' && placedUnits.length > 0 && enemyUnits.length > 0;

  const demoControls = (
    <div className="demo-controls">
      <button
        type="button"
        className="launch-demo-btn"
        disabled={!canLaunchDemo}
        onClick={startDemoFight}
      >
        Launch Demo Fight
      </button>
      <button
        type="button"
        className="scatter-enemy-btn"
        onClick={scatterEnemyUnits}
        disabled={demoState !== 'idle'}
      >
        Scatter Enemy Knights
      </button>
      <button
        type="button"
        className="enemy-preset-btn"
        onClick={() => {
          if (!knightTemplate || enemyUnits.length === 0) return;
          const formation = enemyUnits.map((unit) => unit.position);
          const nextPresets = [...enemyPresets, formation].slice(-5);
          setEnemyPresets(nextPresets);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('armoria_enemy_presets', JSON.stringify(nextPresets));
          }
        }}
        disabled={demoState !== 'idle' || enemyUnits.length === 0}
      >
        Save Enemy Layout
      </button>
      {enemyPresets.length > 0 && (
        <select
          className="enemy-preset-select"
          onChange={(event) => {
            const index = Number(event.target.value);
            if (Number.isNaN(index)) return;
            const formation = enemyPresets[index];
            if (!formation || !knightTemplate) return;
            setEnemyUnits(buildEnemyArmy(knightTemplate, formation));
          }}
          disabled={demoState !== 'idle'}
          defaultValue=""
        >
          <option value="" disabled>
            Load enemy preset
          </option>
          {enemyPresets.map((_, index) => (
            <option key={`preset-${index}`} value={index}>
              Preset #{enemyPresets.length - index}
            </option>
          ))}
        </select>
      )}
      <p className="demo-note">Arrange blue units in rows 6-11 and drag red knights in rows 0-5. The demo uses exactly what you see.</p>
    </div>
  );

  if (!currentUser) {
    return (
      <div className="board-view-container">
        <div className="board-view-header">
          <h1>🎮 Battle Board</h1>
          <p className="header-subtitle">Login to plan your placements.</p>
        </div>
      </div>
    );
  }

  if (currentUser.army.length === 0) {
    return (
      <div className="board-view-container">
        <div className="board-view-header">
          <h1>🎮 Battle Board</h1>
          <p className="header-subtitle">You need units before launching a demo fight. Visit the Army Builder.</p>
        </div>
      </div>
    );
  }

  const subtitle = (() => {
    if (demoState === 'idle') {
      return 'Position your units on rows 6-11 and arrange the enemy squad above before launching a practice battle.';
    }
    if (demoState === 'countdown') {
      const firstMoveText = startingTeam ? ` ${startingTeam === 'player' ? 'Your team' : 'Enemy team'} won the lucky draw and moves first!` : '';
      return `Flight countdown engaged.${firstMoveText} Cameras are swinging into place behind your formation.`;
    }
    if (demoState === 'finished') {
      return winner === 'player'
        ? 'Demo battle complete. Your squad claimed the field—review the outcome below.'
        : 'Demo battle complete. Review the outcome below and adjust placements.';
    }
    return `Demo battle in progress. ${currentTeam === 'player' ? 'Your' : 'Enemy'} team is taking their turn.`;
  })();

  const stageStatusLabel = (() => {
    if (demoState === 'countdown') {
      return 'Flight countdown';
    }
    if (demoState === 'running') {
      return 'Simulating battle';
    }
    if (demoState === 'finished') {
      return winner === 'player' ? 'Victory secured' : 'Regroup and retry';
    }
    return canLaunchDemo ? 'Ready for launch' : 'Awaiting placements';
  })();

  const stageHelperText = (() => {
    if (demoState === 'running') {
      return 'Camera locks onto the fight and tracks each glowing formation.';
    }
    if (demoState === 'countdown') {
      return 'Engines spool up while the camera swings behind your squad.';
    }
    if (demoState === 'finished') {
      return 'Replay the results below, then tweak placements for the next sortie.';
    }
    return 'Drag units on the left, then preview their posture in full 3D.';
  })();

  const isFlightMode = demoState === 'countdown' || demoState === 'running';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    if (isFlightMode) {
      body.classList.add('flight-mode-active');
    } else {
      body.classList.remove('flight-mode-active');
    }
    return () => body.classList.remove('flight-mode-active');
  }, [isFlightMode]);

  return (
    <div className={`board-view-container ${demoState !== 'idle' ? 'demo-mode' : ''} ${isFlightMode ? 'flight-mode' : ''}`}>
      <div className="board-view-header">
        <h1>🎮 Battle Board</h1>
        <p className="header-subtitle">{subtitle}</p>
      </div>

      <div className="immersive-stage-panel">
        <div className="immersive-stage-card">
          <Suspense
            fallback={
              <div className="stage-loading" role="status" aria-live="polite">
                Preparing tactical canvas…
              </div>
            }
          >
            <ThreeBattleStage
              boardSize={BOARD_SIZE}
              units={activeUnits}
              hitCells={hitCells}
              hitEvents={hitEvents}
              moveCells={moveCells}
              marchCells={marchCells}
              demoState={demoState}
            />
          </Suspense>
          {countdownValue !== null && (
            <div className={`countdown-overlay ${countdownValue === 'START' ? 'start' : ''}`}>
              <span key={String(countdownValue)}>{countdownValue}</span>
            </div>
          )}
          <div className="stage-overlay">
            <div>
              <p className="stage-kicker">Immersive Tactical Visualizer</p>
              <p className="stage-caption">{stageHelperText}</p>
            </div>
            <div className={`stage-pill ${demoState}`}>
              <span className="pulse-dot" />
              {stageStatusLabel}
            </div>
            {isFlightMode && (
              <button type="button" className="flight-exit-btn" onClick={exitDemoFight}>
                Abort Flight
              </button>
            )}
          </div>
        </div>
      </div>

      {demoState === 'idle' && demoControls}

      {demoState === 'idle' ? (
        <div className="board-view-content">
          <div className="board-wrapper planning">
            <div className="board-grid">
              {Array.from({ length: BOARD_SIZE }, (_, row) =>
                Array.from({ length: BOARD_SIZE }, (_, col) => renderCell(row, col))
              )}
            </div>
          </div>

          <div className="board-sidebar">
            <h2>Cell Info</h2>
            {selectedCell ? (
              <div className="cell-info">
                <p><strong>Position:</strong> ({selectedCell.row}, {selectedCell.col})</p>
                {selectedUnit ? (
                  <div className="unit-details">
                    <div className="unit-icon-large">{selectedUnit.icon}</div>
                    <h3>{selectedUnit.name}</h3>
                    <div className={`team-badge ${selectedUnit.team}`}>
                      {selectedUnit.team === 'player' ? '🔵 Player' : '🔴 Enemy'}
                    </div>
                    <div className="unit-stats-board">
                      <div className="stat-row">
                        <span>⚔️ Attack:</span>
                        <span>{selectedUnit.damage}</span>
                      </div>
                      <div className="stat-row">
                        <span>🛡️ Defense:</span>
                        <span>{selectedUnit.defense}</span>
                      </div>
                      <div className="stat-row">
                        <span>❤️ HP:</span>
                        <span>{selectedUnit.hp}</span>
                      </div>
                      <div className="stat-row">
                        <span>⚡ Speed:</span>
                        <span>{selectedUnit.speed}</span>
                      </div>
                      <div className="stat-row">
                        <span>🎯 Range:</span>
                        <span>{selectedUnit.range}</span>
                      </div>
                    </div>
                    {selectedUnit.team === 'player' && (
                      <button
                        type="button"
                        className="remove-placement-btn"
                        onClick={() => removePlacement(selectedUnit.instanceId)}
                      >
                        Remove from board
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="empty-cell-message">This cell is empty</p>
                )}
              </div>
            ) : (
              <p className="no-selection">Click on a cell to see details</p>
            )}

            <div className="legend">
              <h3>Placement Queue</h3>
              <p className="legend-note">Drag blue units into rows 6-11. Red knights in rows 0-5 can be repositioned directly on the board.</p>
              <div className="placement-queue">
                {queueUnits.length === 0 && <p className="rule-message">All units placed.</p>}
                {queueUnits.map((unit) => (
                  <div
                    key={unit.instanceId}
                    className="placement-token"
                    draggable
                    onDragStart={(event) => handleDragStart(event, unit.instanceId, 'player')}
                  >
                    <span className="token-icon">{unit.icon}</span>
                    <div>
                      <p>{unit.name}</p>
                      <span>{unit.cost} supply</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : demoState === 'finished' ? (
        <div className="demo-battle-stage">
          <div className="board-wrapper battle">
            <div className="board-grid battle">
              {Array.from({ length: BOARD_SIZE }, (_, row) =>
                Array.from({ length: BOARD_SIZE }, (_, col) => renderCell(row, col))
              )}
            </div>
            <div className="demo-overlay">
              <div className="demo-status">
                <span>Turn {turnNumber} - {currentTeam === 'player' ? '🔵 Player' : '🔴 Enemy'}</span>
                <span>{winner ? `${winner === 'player' ? 'Victory' : 'Defeat'}` : 'Simulating...'}</span>
                {startingTeam && <span className="first-move-badge">First move: {startingTeam === 'player' ? '🔵 Player' : '🔴 Enemy'}</span>}
              </div>
              <button
                type="button"
                className="exit-demo-btn"
                onClick={exitDemoFight}
              >
                {winner ? 'Return to Planning' : 'Abort Demo'}
              </button>
            </div>
            {winner && (
              <div className="battle-announcement">
                <h2>{winner === 'player' ? 'Commander Victory!' : 'Training Loss'}</h2>
                <p>
                  {winner === 'player'
                    ? 'Your tactics overwhelmed the training squad. Tweaks saved; army fully restored.'
                    : 'The training squad held the line. Adjust placements and try again.'}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BoardView;
