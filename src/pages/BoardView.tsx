import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { BOARD_SIZE, PLAYER_ZONE_START } from '../engine/battleEngine';
import type { Team, BattleTickResult } from '../engine/battleEngine';
import type { BoardPlacements, PlacedUnit, Position } from '../types';
import { useUser } from '../context/UserContext';
import { useMultiplayer } from '../context/MultiplayerContext';
import { placementToArmyConfig } from '../utils/placementToArmyConfig';
const ThreeBattleStage = lazy(() => import('../components/ThreeBattleStage'));
import { calculateTickDuration } from '../components/units/useUnitLayer';
import type { DemoState, HitEvent } from '../types/battle';
import './BoardView.css';

// Dynamic tick duration is now calculated per-tick based on animations that will play.
// These constants provide fallbacks and minimum values.
const DEFAULT_TICK_MS = 2000;  // Fallback when no animations are playing
const MIN_TICK_MS = 800;       // Minimum tick duration for visual clarity

type OutcomeState = 'win' | 'lose' | 'draw' | 'pending';

const mapServerWinnerToTeam = (
  winner: 'A' | 'B' | 'draw',
  role: 'A' | 'B' | null
): 'player' | 'enemy' | 'draw' => {
  if (winner === 'draw') return 'draw';
  const seesCanonicalAsPlayer = !role || role === 'A';
  if (seesCanonicalAsPlayer) {
    return winner === 'A' ? 'player' : 'enemy';
  }
  return winner === 'B' ? 'player' : 'enemy';
};

function getLocalOutcome(
  winner: 'A' | 'B' | 'draw' | null,
  role: 'A' | 'B' | null
): OutcomeState {
  if (!winner) return 'pending';
  if (winner === 'draw') return 'draw';
  if (!role) return 'pending';
  return winner === role ? 'win' : 'lose';
}

const deriveStartingTeam = (initialFrame?: BattleTickResult): Team | null => {
  if (!initialFrame) return null;
  // The initial frame (turn 0) has currentTeam set to who moves first
  return initialFrame.currentTeam;
};

const BoardView = () => {
  const { currentUser, updateBoardPlacements } = useUser();
  const {
    status: multiplayerStatus,
    users: onlineUsers,
    incomingChallenge,
    lastResult: multiplayerResult,
    setArmy: setMultiplayerArmy,
    challenge: sendChallenge,
    respondToChallenge,
    startDemoBattle,
    currentRole,
  } = useMultiplayer();
  const currentUserId = currentUser?.id ?? null;
  const currentUsername = currentUser?.username ?? null;
  const isServerConnected = multiplayerStatus === 'connected';
  const [placements, setPlacements] = useState<BoardPlacements>(currentUser?.boardPlacements ?? {});
  const [selectedCell, setSelectedCell] = useState<Position | null>(null);
  const [battleState, setBattleState] = useState<DemoState>('idle');
  const [simulationUnits, setSimulationUnits] = useState<PlacedUnit[]>([]);
  const [hitCells, setHitCells] = useState<string[]>([]);
  const [hitEvents, setHitEvents] = useState<HitEvent[]>([]);
  const [moveCells, setMoveCells] = useState<string[]>([]);
  const [marchCells, setMarchCells] = useState<string[]>([]);
  const [winner, setWinner] = useState<'player' | 'enemy' | 'draw' | null>(null);
  const [currentTeam, setCurrentTeam] = useState<Team>('player');
  const [turnNumber, setTurnNumber] = useState(1);
  const [startingTeam, setStartingTeam] = useState<Team | null>(null);
  const [countdownValue, setCountdownValue] = useState<string | number | null>(null);
  const countdownTimeoutRef = useRef<number | null>(null);
  const previousBattleStateRef = useRef<DemoState>('idle');
  const timelineTimeoutRef = useRef<number | null>(null);
  const timelineIndexRef = useRef(0);
  const lastProcessedMultiplayerResult = useRef<{ matchId: string | null; role: 'A' | 'B' | null }>(
    {
      matchId: null,
      role: null,
    }
  );
  const [battleTimeline, setBattleTimeline] = useState<BattleTickResult[]>([]);
  const [pendingWinner, setPendingWinner] = useState<'player' | 'enemy' | 'draw' | null>(null);

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

  const activeUnits = battleState === 'idle' ? placedUnits : simulationUnits;

  const otherOnlineUsers = useMemo(
    () => onlineUsers.filter((user) => user !== currentUsername),
    [currentUsername, onlineUsers]
  );

  const restoreUnitsToFullHp = useCallback((units: PlacedUnit[]): PlacedUnit[] => {
    let mutated = false;
    const restored = units.map((unit) => {
      const currentHp = unit.currentHp ?? unit.hp;
      if (currentHp >= unit.hp) {
        return unit;
      }
      mutated = true;
      return { ...unit, currentHp: unit.hp };
    });
    return mutated ? restored : units;
  }, []);

  useEffect(() => {
    if (previousBattleStateRef.current !== 'finished' && battleState === 'finished') {
      setSimulationUnits((prev) => {
        const restored = restoreUnitsToFullHp(prev);
        return restored === prev ? prev : restored;
      });
    }
    previousBattleStateRef.current = battleState;
  }, [battleState, restoreUnitsToFullHp]);

  useEffect(() => {
    setPlacements(currentUser?.boardPlacements ?? {});
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    updateBoardPlacements(placements);
  }, [placements, currentUserId, updateBoardPlacements]);

  const syncArmyToServer = useCallback(() => {
    if (!isServerConnected || placedUnits.length === 0) {
      return;
    }
    setMultiplayerArmy(placementToArmyConfig(placedUnits));
  }, [isServerConnected, placedUnits, setMultiplayerArmy]);

  useEffect(() => {
    syncArmyToServer();
  }, [syncArmyToServer]);

  const handleChallengeUser = useCallback(
    (opponentName: string) => {
      if (!isServerConnected) {
        alert('Connect to the multiplayer server before sending a challenge.');
        return;
      }
      if (placedUnits.length === 0) {
        alert('Place at least one unit before challenging another commander.');
        return;
      }
      syncArmyToServer();
      sendChallenge(opponentName);
    },
    [isServerConnected, placedUnits.length, sendChallenge, syncArmyToServer]
  );

  const handleAcceptChallenge = useCallback(() => {
    if (!incomingChallenge) {
      return;
    }
    if (!isServerConnected) {
      alert('Reconnect to the multiplayer server before accepting a live battle.');
      return;
    }
    if (placedUnits.length === 0) {
      alert('Place at least one unit before accepting a battle.');
      return;
    }
    syncArmyToServer();
    respondToChallenge(incomingChallenge, true);
  }, [incomingChallenge, isServerConnected, placedUnits.length, respondToChallenge, syncArmyToServer]);

  const handleDeclineChallenge = useCallback(() => {
    if (!incomingChallenge) {
      return;
    }
    respondToChallenge(incomingChallenge, false);
  }, [incomingChallenge, respondToChallenge]);

  const handleDemoBattle = useCallback(() => {
    if (!isServerConnected) {
      alert('Connect to the multiplayer server before starting a demo battle.');
      return;
    }
    if (placedUnits.length === 0) {
      alert('Place at least one unit before starting a demo battle.');
      return;
    }
    const armyConfig = placementToArmyConfig(placedUnits);
    startDemoBattle(armyConfig);
  }, [isServerConnected, placedUnits, startDemoBattle]);

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

  const handleDragStart = (event: DragEvent<HTMLDivElement>, instanceId: string) => {
    event.dataTransfer.setData('text/plain', `player:${instanceId}`);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!currentUser || battleState !== 'idle') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, row: number, col: number) => {
    if (battleState !== 'idle') return;
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
    const allowPlacement = battleState === 'idle';
    const isPlayerUnit = unit?.team === 'player';
    const canDragUnit = allowPlacement && isPlayerUnit;

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
            onDragStart={canDragUnit ? (event) => handleDragStart(event, unit.instanceId) : undefined}
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

  const clearBattleHighlights = useCallback(() => {
    setHitCells([]);
    setHitEvents([]);
    setMoveCells([]);
    setMarchCells([]);
  }, []);

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
          setBattleState('running');
        } else {
          step();
        }
      }, isLast ? 650 : 900);
    };

    step();
  }, [clearCountdownTimers]);

  useEffect(() => () => clearCountdownTimers(), [clearCountdownTimers]);

  useEffect(() => {
    if (!multiplayerResult) {
      return;
    }
    const roleKey = currentRole ?? null;
    const alreadyProcessed =
      lastProcessedMultiplayerResult.current.matchId === multiplayerResult.matchId &&
      lastProcessedMultiplayerResult.current.role === roleKey;

    if (alreadyProcessed) {
      return;
    }

    lastProcessedMultiplayerResult.current = {
      matchId: multiplayerResult.matchId,
      role: roleKey,
    };

    const timeline = multiplayerResult.timeline ?? [];
    const winnerFromServer = mapServerWinnerToTeam(multiplayerResult.winner, roleKey);

    setPendingWinner(winnerFromServer);
    setBattleTimeline(timeline);
    setStartingTeam(deriveStartingTeam(timeline[0]));
    setWinner(null);
    // Start playback from frame 1 (first action frame)
    // Frame 0 is the initial positioning frame
    timelineIndexRef.current = 1;
    clearBattleHighlights();
    clearCountdownTimers();
    if (timeline[0]) {
      setSimulationUnits(timeline[0].units);
    }

    // If timeline has only the initial frame (no actions), finish immediately
    if (timeline.length <= 1) {
      setWinner(winnerFromServer);
      setBattleState('finished');
      return;
    }

    setBattleState('countdown');
    beginFlightCountdown();
  }, [beginFlightCountdown, clearCountdownTimers, clearBattleHighlights, currentRole, multiplayerResult]);

  useEffect(() => {
    if (hitCells.length === 0 && moveCells.length === 0) return;
    const timeout = window.setTimeout(() => {
      clearBattleHighlights();
    }, 420);
    return () => window.clearTimeout(timeout);
  }, [hitCells, moveCells, clearBattleHighlights]);

  useEffect(() => {
    if (marchCells.length === 0) return;
    const timeout = window.setTimeout(() => setMarchCells([]), 320);
    return () => window.clearTimeout(timeout);
  }, [marchCells]);

  // Track timeout for dynamic tick scheduling
  useEffect(() => {
    if (battleState !== 'running' || battleTimeline.length === 0) {
      if (timelineTimeoutRef.current !== null) {
        window.clearTimeout(timelineTimeoutRef.current);
        timelineTimeoutRef.current = null;
      }
      return;
    }

    const playTick = () => {
      const tick = battleTimeline[timelineIndexRef.current];
      if (!tick) {
        setBattleState('finished');
        setWinner(pendingWinner);
        return;
      }

      setSimulationUnits(tick.units);
      setHitCells(tick.hits);
      setHitEvents(tick.hitEvents);
      setMoveCells(tick.moves);
      setMarchCells(tick.moves.filter((_, index) => index % 2 === 0));
      setCurrentTeam(tick.currentTeam);
      setTurnNumber(tick.turnNumber);

      if (tick.winner) {
        setWinner(tick.winner);
        setBattleState('finished');
        return;
      }

      if (timelineIndexRef.current >= battleTimeline.length - 1) {
        setWinner(pendingWinner);
        setBattleState('finished');
        return;
      }

      timelineIndexRef.current += 1;
      const upcomingTick = battleTimeline[timelineIndexRef.current];
      const tickDuration = upcomingTick && upcomingTick.hitEvents.length > 0
        ? calculateTickDuration(upcomingTick.hitEvents, upcomingTick.units)
        : DEFAULT_TICK_MS;

      timelineTimeoutRef.current = window.setTimeout(playTick, Math.max(tickDuration, MIN_TICK_MS));
    };

    // Kick off playback with a short delay to let countdown dissolve
    timelineTimeoutRef.current = window.setTimeout(playTick, DEFAULT_TICK_MS);

    return () => {
      if (timelineTimeoutRef.current !== null) {
        window.clearTimeout(timelineTimeoutRef.current);
        timelineTimeoutRef.current = null;
      }
    };
  }, [battleTimeline, battleState, pendingWinner]);

  const exitBattle = () => {
    setBattleState('idle');
    setSimulationUnits([]);
    setWinner(null);
    setCurrentTeam('player');
    setTurnNumber(1);
    setStartingTeam(null);
    setBattleTimeline([]);
    setPendingWinner(null);
    timelineIndexRef.current = 0;
    if (timelineTimeoutRef.current !== null) {
      window.clearTimeout(timelineTimeoutRef.current);
      timelineTimeoutRef.current = null;
    }
    clearBattleHighlights();
    clearCountdownTimers();
  };

  const canSyncMultiplayerArmy = isServerConnected && placedUnits.length > 0;

  const armyControls = (
    <div className="army-controls">
      {!isServerConnected && (
        <p className="army-note warning">
          Login (or reconnect) to the multiplayer server to sync your army.
        </p>
      )}
      <button
        type="button"
        className="save-placement-btn"
        disabled={!canSyncMultiplayerArmy}
        onClick={syncArmyToServer}
      >
        Save Multiplayer Army
      </button>
      <button
        type="button"
        className="demo-battle-btn"
        disabled={!isServerConnected || placedUnits.length === 0}
        onClick={handleDemoBattle}
      >
        ⚔️ Demo Battle
      </button>
      <p className="army-note">Position your units on rows 6-11, save your army, then challenge another player or try a demo battle.</p>
    </div>
  );

  const multiplayerPanel = (
    <section className="multiplayer-panel" aria-label="Multiplayer controls">
      <div className="multiplayer-panel-header">
        <div>
          <h3>Multiplayer</h3>
          <p className="panel-subtitle">
            {isServerConnected
              ? `Synced as ${currentUsername ?? 'Commander'}.`
              : 'Login to sync placements and launch live battles.'}
          </p>
        </div>
        <span className={`multiplayer-status ${multiplayerStatus}`}>
          {multiplayerStatus.toUpperCase()}
        </span>
      </div>

      {incomingChallenge && (
        <div className="challenge-banner" role="alert">
          <div>
            <strong>{incomingChallenge}</strong> challenged you to a battle.
          </div>
          <div className="challenge-banner-actions">
            <button
              type="button"
              className="accept-btn"
              onClick={handleAcceptChallenge}
              disabled={!isServerConnected || placedUnits.length === 0}
            >
              Accept
            </button>
            <button type="button" className="decline-btn" onClick={handleDeclineChallenge}>
              Decline
            </button>
          </div>
        </div>
      )}

      <div className="multiplayer-user-list">
        <div className="user-list-title">Online Commanders</div>
        {placedUnits.length === 0 && (
          <p className="user-list-empty">Place at least one unit to enable live battles.</p>
        )}
        {otherOnlineUsers.length === 0 ? (
          <p className="user-list-empty">No other players online right now.</p>
        ) : (
          otherOnlineUsers.map((user) => (
            <div key={user} className="multiplayer-user-row">
              <span>{user}</span>
              <button
                type="button"
                className="challenge-btn"
                onClick={() => handleChallengeUser(user)}
                disabled={!isServerConnected || placedUnits.length === 0}
              >
                Challenge
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );

  const isFlightMode = battleState === 'countdown' || battleState === 'running';

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
          <p className="header-subtitle">You need units before launching a battle. Visit the Army Builder.</p>
        </div>
      </div>
    );
  }

  const activeBattleLabel = 'Multiplayer battle';

  const multiplayerOutcome: OutcomeState = getLocalOutcome(
    multiplayerResult?.winner ?? null,
    currentRole ?? null
  );

  const overallOutcome: OutcomeState = multiplayerOutcome;

  const subtitle = (() => {
    if (battleState === 'idle') {
      return 'Position your units on rows 6-11, save your army, then challenge another player.';
    }
    if (battleState === 'countdown') {
      const firstMoveText = startingTeam ? ` ${startingTeam === 'player' ? 'Your team' : 'Enemy team'} moves first!` : '';
      return `Flight countdown engaged.${firstMoveText} Cameras are swinging into place behind your formation.`;
    }
    if (battleState === 'running') {
      return `${activeBattleLabel} in progress. ${currentTeam === 'player' ? 'Your' : 'Enemy'} team is taking their turn.`;
    }
    if (battleState === 'finished') {
      if (winner === 'player') {
        return `${activeBattleLabel} complete. Your squad claimed the field—review the outcome below.`;
      }
      if (winner === 'enemy') {
        return `${activeBattleLabel} complete. Review the outcome below and adjust placements.`;
      }
      return `${activeBattleLabel} ended in a stalemate. Study the replay and tweak your approach.`;
    }
    return `${activeBattleLabel} in progress. ${currentTeam === 'player' ? 'Your' : 'Enemy'} team is taking their turn.`;
  })();

  const stageStatusLabel = (() => {
    if (battleState === 'countdown') {
      return 'Flight countdown';
    }
    if (battleState === 'running') {
      return 'Simulating battle';
    }
    if (battleState === 'finished') {
      if (winner === 'player') return 'Victory secured';
      if (winner === 'enemy') return 'Regroup and retry';
      return 'Stalemate reached';
    }
    if (!isServerConnected) {
      return 'Connect to server';
    }
    return placedUnits.length > 0 ? 'Ready for launch' : 'Awaiting placements';
  })();

  const stageHelperText = (() => {
    if (battleState === 'countdown') {
      return 'Engines spool up while the camera swings behind your squad.';
    }
    if (battleState === 'running') {
      return 'Camera locks onto the fight and tracks each glowing formation.';
    }
    if (battleState === 'finished') {
      return winner === 'draw'
        ? 'A stalemate is still intel—review the replay and refine your tactics.'
        : 'Replay the results below, then tweak placements for the next sortie.';
    }
    return 'Drag units on the left, then preview their posture in full 3D.';
  })();

  const battleResultHeading = (() => {
    if (!winner) return '';
    if (overallOutcome === 'win') return 'You Won';
    if (overallOutcome === 'lose') return 'You Lost';
    if (overallOutcome === 'draw') return 'Draw';
    return 'Battle Complete';
  })();

  const battleResultDescription = (() => {
    if (!winner) return '';
    if (overallOutcome === 'win') {
      return 'You outmaneuvered your opponent. Placements synced for the next duel.';
    }
    if (overallOutcome === 'lose') {
      return 'Your opponent held the field. Refine your placements and strike back.';
    }
    if (overallOutcome === 'draw') {
      return 'Neither side broke through—replay the battle and adjust your army.';
    }
    return '';
  })();

  return (
    <div className={`board-view-container ${battleState !== 'idle' ? 'battle-mode' : ''} ${isFlightMode ? 'flight-mode' : ''}`}>
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
              demoState={battleState}
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
            <div className={`stage-pill ${battleState}`}>
              <span className="pulse-dot" />
              {stageStatusLabel}
            </div>
            {isFlightMode && (
              <button type="button" className="flight-exit-btn" onClick={exitBattle}>
                Abort Flight
              </button>
            )}
          </div>
        </div>
      </div>
      {battleState === 'idle' && armyControls}
      {multiplayerPanel}

      {battleState === 'idle' ? (
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
                    onDragStart={(event) => handleDragStart(event, unit.instanceId)}
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
      ) : battleState === 'finished' ? (
        <div className="battle-stage">
          <div className="board-wrapper battle">
            <div className="board-grid battle">
              {Array.from({ length: BOARD_SIZE }, (_, row) =>
                Array.from({ length: BOARD_SIZE }, (_, col) => renderCell(row, col))
              )}
            </div>
            <div className="battle-overlay">
              <div className="battle-status">
                <span>Turn {turnNumber} - {currentTeam === 'player' ? '🔵 Player' : '🔴 Enemy'}</span>
                <span>
                  {winner ? (overallOutcome === 'win' ? 'You Won' : overallOutcome === 'lose' ? 'You Lost' : 'Draw') : 'Simulating...'}
                </span>
                {startingTeam && <span className="first-move-badge">First move: {startingTeam === 'player' ? '🔵 Player' : '🔴 Enemy'}</span>}
              </div>
              <button
                type="button"
                className="exit-battle-btn"
                onClick={exitBattle}
              >
                {winner ? 'Return to Planning' : 'Abort Replay'}
              </button>
            </div>
            {winner && (
              <div className="battle-announcement">
                <h2>{battleResultHeading}</h2>
                <p>{battleResultDescription}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BoardView;
