import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOARD_SIZE, BOARD_COLS, PLAYER_ZONE_START } from '../engine/battleEngine';
import type { Team, BattleTickResult } from '../engine/battleEngine';
import type { ArmyUnitInstance, BoardPlacements, PlacedUnit, UnitLogic } from '../types';
import { useUser } from '../context/UserContext';
import { useMultiplayer } from '../context/MultiplayerContext';
import type { PreviewChange } from '../hooks/useGameServer';
import { placementToArmyConfig } from '../utils/placementToArmyConfig';
const ThreeBattleStage = lazy(() => import('../components/ThreeBattleStage'));
const BattlePreview = lazy(() => import('../components/BattlePreview'));
import { calculateTickDuration } from '../components/units/useUnitLayer';
import type { DemoState, HitEvent } from '../types/battle';
import { useUnitCatalog } from '../hooks/useUnitCatalog';
import { usePlayerArmy } from '../hooks/usePlayerArmy';
import BoardSetupPanel from '../components/BoardSetupPanel';
import './BoardView.css';

// Dynamic tick duration is now calculated per-tick based on animations that will play.
// These constants provide fallbacks and minimum values.
const DEFAULT_TICK_MS = 2000;  // Fallback when no animations are playing
const MIN_TICK_MS = 800;       // Minimum tick duration for visual clarity
const MAX_SUPPLY = 20;
const PLANNING_ROWS = 6;
const PLANNING_COLS = 6;
const PLANNING_ROW_OFFSET = PLAYER_ZONE_START;

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
    // Preview phase
    previewMatchId,
    previewYourRole,
    previewOpponentName,
    previewYourBoard,
    previewOpponentBoard,
    previewTurn,
    sendPreviewChange,
  } = useMultiplayer();
  const { units: catalogUnits } = useUnitCatalog();
  const { units: armyUnits, loading: armyLoading } = usePlayerArmy();
  const currentUserId = currentUser?.id ?? null;
  const currentUsername = currentUser?.username ?? null;
  const isServerConnected = multiplayerStatus === 'connected';
  const [placements, setPlacements] = useState<BoardPlacements>(currentUser?.boardPlacements ?? {});
  const [supplyError, setSupplyError] = useState<string | null>(null);
  const [battleState, setBattleState] = useState<DemoState>('idle');
  const [simulationUnits, setSimulationUnits] = useState<PlacedUnit[]>([]);
  const [hitCells, setHitCells] = useState<string[]>([]);
  const [hitEvents, setHitEvents] = useState<HitEvent[]>([]);
  const [moveCells, setMoveCells] = useState<string[]>([]);
  const [marchCells, setMarchCells] = useState<string[]>([]);
  const [winner, setWinner] = useState<'player' | 'enemy' | 'draw' | null>(null);
  const [currentTeam, setCurrentTeam] = useState<Team>('player');
  const [_turnNumber, setTurnNumber] = useState(1);
  const [startingTeam, setStartingTeam] = useState<Team | null>(null);
  const [countdownValue, setCountdownValue] = useState<string | number | null>(null);
  const [unitLogic, setUnitLogic] = useState<UnitLogic>({});
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

  const catalogById = useMemo(() => new Map(catalogUnits.map((unit) => [unit.id, unit])), [catalogUnits]);

  const armyInstances = useMemo(() => {
    return armyUnits
      .map((armyUnit) => {
        const meta = catalogById.get(armyUnit.unitTypeId.toLowerCase());
        if (!meta) return null;
        return { ...meta, instanceId: armyUnit.id } as ArmyUnitInstance;
      })
      .filter(Boolean) as ArmyUnitInstance[];
  }, [armyUnits, catalogById]);

  const supplyByUnitType = useMemo(() => {
    return catalogUnits.reduce((acc, unit) => {
      acc[unit.id] = unit.supplyCost ?? unit.cost ?? 0;
      return acc;
    }, {} as Record<string, number>);
  }, [catalogUnits]);

  const resolveSupplyCost = useCallback(
    (unitTypeId: string, instance?: ArmyUnitInstance) =>
      supplyByUnitType[unitTypeId] ?? instance?.supplyCost ?? instance?.cost ?? 0,
    [supplyByUnitType]
  );

  const placedUnits: PlacedUnit[] = useMemo(() => {
    return armyInstances
      .map((unit) => {
        const position = placements[unit.instanceId];
        if (!position) return null;
        return {
          ...unit,
          position,
          team: 'player' as const,
          currentHp: unit.hp,
          selectedBehaviors: unitLogic[unit.instanceId]
        };
      })
      .filter(Boolean) as PlacedUnit[];
  }, [armyInstances, placements, unitLogic]);

  const totalSupplyUsed = useMemo(
    () => placedUnits.reduce((sum, unit) => sum + resolveSupplyCost(unit.id, unit), 0),
    [placedUnits, resolveSupplyCost]
  );

  const remainingSupply = Math.max(0, MAX_SUPPLY - totalSupplyUsed);
  const isSupplyCapReached = totalSupplyUsed >= MAX_SUPPLY;

  const stageUnits = battleState === 'idle' ? ([] as PlacedUnit[]) : simulationUnits;
  const stageBoardRows = BOARD_SIZE;
  const stageBoardCols = BOARD_COLS;
  const stageHitCells = battleState === 'idle' ? [] : hitCells;
  const stageMoveCells = battleState === 'idle' ? [] : moveCells;
  const stageMarchCells = battleState === 'idle' ? [] : marchCells;

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
    if (!armyInstances.length) return;
    const validIds = new Set(armyInstances.map((unit) => unit.instanceId));
    setPlacements((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (!validIds.has(key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [armyInstances]);

  useEffect(() => {
    if (!currentUserId) return;
    updateBoardPlacements(placements);
  }, [placements, currentUserId, updateBoardPlacements]);

  useEffect(() => {
    if (!supplyError) return;
    const timeout = window.setTimeout(() => setSupplyError(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [supplyError]);

  useEffect(() => {
    if (totalSupplyUsed < MAX_SUPPLY) {
      setSupplyError(null);
    }
  }, [totalSupplyUsed]);

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

  const handleSendPreviewChange = useCallback(
    (change: PreviewChange) => {
      if (!previewMatchId) return;
      sendPreviewChange(previewMatchId, change);
    },
    [previewMatchId, sendPreviewChange]
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

  const isWithinPlanningBounds = useCallback(
    (row: number, col: number) =>
      row >= PLANNING_ROW_OFFSET && row < PLANNING_ROW_OFFSET + PLANNING_ROWS && col >= 0 && col < PLANNING_COLS,
    []
  );

  useEffect(() => {
    setPlacements((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(next).forEach(([key, position]) => {
        if (!isWithinPlanningBounds(position.row, position.col)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [isWithinPlanningBounds]);

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
      <p className="army-note">Drag units onto the 6x6 blue grid, save your army, then challenge another player or try a demo battle.</p>
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

  if (armyLoading) {
    return (
      <div className="board-view-container">
        <div className="board-view-header">
          <h1>🎮 Battle Board</h1>
          <p className="header-subtitle">Loading your army…</p>
        </div>
      </div>
    );
  }

  if (armyInstances.length === 0) {
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
      return 'Drag units from the stack into the close-up 6x6 grid, then save your army.';
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

  const hasPreviewSession = Boolean(
    previewMatchId && previewYourRole && previewOpponentName && previewTurn
  );
  const previewBoardsReady = Boolean(
    previewYourBoard &&
    previewOpponentBoard &&
    previewYourBoard.length > 0 &&
    previewOpponentBoard.length > 0
  );

  if (hasPreviewSession && !previewBoardsReady) {
    return (
      <div className="board-view-container">
        <div className="board-view-header">
          <h1>🎮 Pre-Battle Preview</h1>
          <p className="header-subtitle">Syncing boards with the server…</p>
        </div>
        <div className="stage-loading" role="status" aria-live="polite">
          Loading battle boards…
        </div>
      </div>
    );
  }

  // Show preview phase if it's active
  if (
    hasPreviewSession &&
    previewBoardsReady &&
    previewMatchId &&
    previewYourRole &&
    previewOpponentName &&
    previewYourBoard &&
    previewOpponentBoard &&
    previewTurn
  ) {
    const isYourTurn = previewTurn === previewYourRole;
    return (
      <div className="board-view-container">
        <div className="board-view-header">
          <h1>🎮 Pre-Battle Preview</h1>
          <p className="header-subtitle">Review and adjust your strategy before the duel begins</p>
        </div>
        <Suspense
          fallback={
            <div className="stage-loading" role="status" aria-live="polite">
              Loading preview…
            </div>
          }
        >
          <BattlePreview
            matchId={previewMatchId}
            yourRole={previewYourRole}
            opponentName={previewOpponentName}
            yourBoard={previewYourBoard}
            opponentBoard={previewOpponentBoard}
            isYourTurn={isYourTurn}
            onSendChange={handleSendPreviewChange}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={`board-view-container ${battleState !== 'idle' ? 'battle-mode' : ''} ${isFlightMode ? 'flight-mode' : ''}`}>
      <div className="board-view-header">
        <h1>🎮 Battle Board</h1>
        <p className="header-subtitle">{subtitle}</p>
      </div>

      <div className={`immersive-stage-panel ${battleState === 'idle' ? 'with-side' : ''}`}>
        {battleState === 'idle' ? (
          <BoardSetupPanel
            mode="pvp"
            armyInstances={armyInstances}
            placements={placements}
            setPlacements={setPlacements}
            unitLogic={unitLogic}
            setUnitLogic={setUnitLogic}
            resolveSupplyCost={resolveSupplyCost}
            totalSupplyUsed={totalSupplyUsed}
            maxSupply={MAX_SUPPLY}
            setSupplyError={setSupplyError}
          />
        ) : (
          <div className="immersive-stage-card">
            <Suspense
              fallback={
                <div className="stage-loading" role="status" aria-live="polite">
                  Preparing tactical canvas…
                </div>
              }
            >
              <ThreeBattleStage
                boardSize={stageBoardRows}
                boardCols={stageBoardCols}
                units={stageUnits}
                hitCells={stageHitCells}
                hitEvents={hitEvents}
                moveCells={stageMoveCells}
                marchCells={stageMarchCells}
                demoState={battleState}
                interactionMode="battle"
                dragActive={false}
                forceOwner={undefined}
              />
            </Suspense>
            {isFlightMode && (
              <div className="battle-skip-overlay">
                <button type="button" className="flight-exit-btn" onClick={exitBattle}>
                  Skip
                </button>
              </div>
            )}
            {countdownValue !== null && (
              <div className={`countdown-overlay ${countdownValue === 'START' ? 'start' : ''}`}>
                <span key={String(countdownValue)}>{countdownValue}</span>
              </div>
            )}
            {/* <div className="stage-overlay">
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
            </div> */}
          </div>
        )}
      </div>
      {battleState === 'idle' && armyControls}
      {battleState === 'idle' && (
        <div className="supply-status" role="status" aria-live="polite">
          <div className="supply-meter">Supply: {totalSupplyUsed} / {MAX_SUPPLY}</div>
          <div className={`supply-remaining ${isSupplyCapReached ? 'cap' : ''}`}>
            {isSupplyCapReached ? 'Cap reached' : `${remainingSupply} remaining`}
          </div>
          {supplyError && (
            <div className="supply-error" role="alert">
              {supplyError}
            </div>
          )}
        </div>
      )}
      {multiplayerPanel}

      {battleState === 'finished' && (
        <div className="battle-summary-card">
          <div>
            <h2>{battleResultHeading || 'Battle Complete'}</h2>
            <p>{battleResultDescription || 'Review the replay in the 3D view above, then tweak placements.'}</p>
          </div>
          <button type="button" className="exit-battle-btn" onClick={exitBattle}>
            Return to Planning
          </button>
        </div>
      )}

    </div>
  );
};

export default BoardView;
