import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BOARD_SIZE, BOARD_COLS, PLAYER_ZONE_START } from '../engine/battleEngine';
import type { Team, BattleTickResult } from '../engine/battleEngine';
import type { ArmyUnitInstance, BoardPlacements, PlacedUnit, UnitLogic } from '../types';
import type { TileOccupant } from '../components/createTacticalBoard';
import { useUser } from '../context/UserContext';
import { useMultiplayer } from '../context/MultiplayerContext';
import { placementToArmyConfig } from '../utils/placementToArmyConfig';
const ThreeBattleStage = lazy(() => import('../components/ThreeBattleStage'));
const UnitLogicPanel = lazy(() => import('../components/UnitLogicPanel'));
import { calculateTickDuration } from '../components/units/useUnitLayer';
import type { DemoState, HitEvent } from '../types/battle';
import { useUnitCatalog } from '../hooks/useUnitCatalog';
import { usePlayerArmy } from '../hooks/usePlayerArmy';
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
  const [hoveredTile, setHoveredTile] = useState<{ row: number; col: number; occupied: boolean } | null>(null);
  const [draggingUnit, setDraggingUnit] = useState<{ unit: ArmyUnitInstance } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [tileMenu, setTileMenu] = useState<{ row: number; col: number; unit: PlacedUnit } | null>(null);
  const [unitLogic, setUnitLogic] = useState<UnitLogic>({});
  const [logicPanelUnit, setLogicPanelUnit] = useState<PlacedUnit | null>(null);
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

  const debugMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('mode') === 'debug';
  }, []);

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

  const unitByInstanceId = useMemo(() => {
    return armyInstances.reduce((acc, unit) => {
      acc[unit.instanceId] = unit;
      return acc;
    }, {} as Record<string, ArmyUnitInstance>);
  }, [armyInstances]);

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

  const queueUnits = useMemo(() => {
    return armyInstances.filter((unit) => !placements[unit.instanceId]);
  }, [armyInstances, placements]);

  const totalSupplyUsed = useMemo(
    () => placedUnits.reduce((sum, unit) => sum + resolveSupplyCost(unit.id, unit), 0),
    [placedUnits, resolveSupplyCost]
  );

  const remainingSupply = Math.max(0, MAX_SUPPLY - totalSupplyUsed);
  const isSupplyCapReached = totalSupplyUsed >= MAX_SUPPLY;

  const activeUnits = battleState === 'idle' ? placedUnits : simulationUnits;

  const planningUnits = useMemo(() => {
    if (battleState !== 'idle') return [] as PlacedUnit[];
    return placedUnits
      .map((unit) => ({
        ...unit,
        position: {
          row: unit.position.row - PLANNING_ROW_OFFSET,
          col: unit.position.col
        }
      }))
      .filter(
        (unit) =>
          unit.position.row >= 0 &&
          unit.position.row < PLANNING_ROWS &&
          unit.position.col >= 0 &&
          unit.position.col < PLANNING_COLS
      );
  }, [battleState, placedUnits]);

  const stageUnits = battleState === 'idle' ? planningUnits : activeUnits;

  const stageBoardRows = battleState === 'idle' ? PLANNING_ROWS : BOARD_SIZE;
  const stageBoardCols = battleState === 'idle' ? PLANNING_COLS : BOARD_COLS;
  const stageHitCells = battleState === 'idle' ? [] : hitCells;
  const stageMoveCells = battleState === 'idle' ? [] : moveCells;
  const stageMarchCells = battleState === 'idle' ? [] : marchCells;

  const hoveredUnit = useMemo(() => {
    if (!hoveredTile) return null;
    const boardRow = hoveredTile.row + PLANNING_ROW_OFFSET;
    return placedUnits.find((unit) => unit.position.row === boardRow && unit.position.col === hoveredTile.col) ?? null;
  }, [hoveredTile, placedUnits]);

  const tilePressRef = useRef<{ unit: PlacedUnit; startX: number; startY: number } | null>(null);
  const DRAG_START_THRESHOLD = 6;

  const availableStacks = useMemo(() => {
    const stacks = new Map<string, { unit: ArmyUnitInstance; instances: ArmyUnitInstance[] }>();
    queueUnits.forEach((unit) => {
      const existing = stacks.get(unit.id) ?? { unit, instances: [] };
      existing.unit = unit;
      existing.instances.push(unit);
      stacks.set(unit.id, existing);
    });
    return Array.from(stacks.values());
  }, [queueUnits]);

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

  const removePlacement = useCallback((instanceId: string) => {
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
  }, []);

  const isWithinPlanningBounds = useCallback(
    (row: number, col: number) =>
      row >= PLANNING_ROW_OFFSET && row < PLANNING_ROW_OFFSET + PLANNING_ROWS && col >= 0 && col < PLANNING_COLS,
    []
  );

  const commitPlacement = useCallback(
    (unit: ArmyUnitInstance, targetRow: number, targetCol: number) => {
      if (!isWithinPlanningBounds(targetRow, targetCol)) {
        return false;
      }
      const occupying = placedUnits.find((placed) => placed.position.row === targetRow && placed.position.col === targetCol);
      if (occupying) {
        return false;
      }

      const unitSupply = resolveSupplyCost(unit.id, unit);
      const alreadyPlaced = Boolean(placements[unit.instanceId]);
      const projectedSupply = totalSupplyUsed + (alreadyPlaced ? 0 : unitSupply);
      if (projectedSupply > MAX_SUPPLY) {
        setSupplyError(`Supply cap reached (${MAX_SUPPLY}). Remove a unit to add another.`);
        return false;
      }

      setSupplyError(null);
      setPlacements((prev) => ({ ...prev, [unit.instanceId]: { row: targetRow, col: targetCol } }));
      return true;
    },
    [isWithinPlanningBounds, placedUnits, resolveSupplyCost, totalSupplyUsed, placements]
  );

  const startStackDrag = useCallback((event: ReactPointerEvent, unit: ArmyUnitInstance) => {
    event.preventDefault();
    console.log('[BoardView] Starting drag for unit:', unit.name);
    setDraggingUnit({ unit });
    setDragPosition({ x: event.clientX, y: event.clientY });
    setTileMenu(null);
  }, []);

  const handleTileHover = useCallback((info: { row: number; col: number; occupied: TileOccupant | null }) => {
    if (info.row < 0 || info.col < 0) {
      setHoveredTile(null);
      return;
    }
    setHoveredTile({ row: info.row, col: info.col, occupied: Boolean(info.occupied) });
  }, []);

  const endDrag = useCallback(() => {
    setDraggingUnit(null);
    setDragPosition(null);
    setHoveredTile(null);
  }, []);

  const handleTileDrop = useCallback(
    ({ row, col, occupied }: { row: number; col: number; occupied: TileOccupant | null }) => {
      console.log('[BoardView] handleTileDrop called:', { row, col, occupied, draggingUnit: draggingUnit?.unit.name });
      if (!draggingUnit) {
        console.log('[BoardView] No dragging unit, ignoring drop');
        return;
      }
      // row < 0 means drop was outside a valid tile (cancellation)
      if (row >= 0 && col >= 0 && !occupied) {
        const boardRow = row + PLANNING_ROW_OFFSET;
        console.log('[BoardView] Committing placement at:', boardRow, col);
        commitPlacement(draggingUnit.unit, boardRow, col);
      } else {
        console.log('[BoardView] Drop cancelled or invalid:', { row, col, occupied });
      }
      endDrag();
    },
    [commitPlacement, draggingUnit, endDrag]
  );

  const handleTileClick = useCallback(
    ({ row, col }: { row: number; col: number; occupied: TileOccupant | null }) => {
      const boardRow = row + PLANNING_ROW_OFFSET;
      const unit = placedUnits.find((placed) => placed.position.row === boardRow && placed.position.col === col);
      if (!unit) return;
      setTileMenu({ row: boardRow, col, unit });
    },
    [placedUnits]
  );

  const beginMoveFromTile = useCallback(
    (unit: PlacedUnit) => {
      const instance = unitByInstanceId[unit.instanceId];
      if (!instance) return;
      setTileMenu(null);
      removePlacement(unit.instanceId);
      setDraggingUnit({ unit: instance });
      setDragPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    },
    [removePlacement, unitByInstanceId]
  );

  const openLogicPanel = useCallback((unit: PlacedUnit) => {
    setLogicPanelUnit(unit);
    setTileMenu(null);
  }, []);

  // Keep logicPanelUnit in sync with placedUnits as behaviors are updated
  const syncedLogicPanelUnit = useMemo(() => {
    if (!logicPanelUnit) return null;
    const updated = placedUnits.find(u => u.instanceId === logicPanelUnit.instanceId);
    return updated || logicPanelUnit;
  }, [logicPanelUnit, placedUnits]);

  const closeLogicPanel = useCallback(() => {
    setLogicPanelUnit(null);
  }, []);

  const handleBehaviorSelect = useCallback((instanceId: string, behavior: string, categoryKey?: string) => {
    setUnitLogic((prev) => {
      const currentBehaviors = prev[instanceId] ?? [];
      
      if (categoryKey) {
        // For categorized behaviors (like Archer), toggle within category
        const newBehaviors = currentBehaviors.filter(b => !b.startsWith(categoryKey));
        return {
          ...prev,
          [instanceId]: [...newBehaviors, behavior]
        };
      }
      
      // For simple behaviors, replace entirely
      return {
        ...prev,
        [instanceId]: [behavior]
      };
    });
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (tilePressRef.current) {
        const { startX, startY, unit } = tilePressRef.current;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (Math.hypot(dx, dy) >= DRAG_START_THRESHOLD) {
          const instance = unitByInstanceId[unit.instanceId];
          if (instance) {
            setTileMenu(null);
            removePlacement(unit.instanceId);
            setDraggingUnit({ unit: instance });
            setDragPosition({ x: event.clientX, y: event.clientY });
          }
          tilePressRef.current = null;
          return;
        }
      }
      if (!draggingUnit) return;
      setDragPosition({ x: event.clientX, y: event.clientY });
    },
    [DRAG_START_THRESHOLD, draggingUnit, removePlacement, setTileMenu, unitByInstanceId]
  );

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [handlePointerMove]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (battleState !== 'idle') return;
      if (draggingUnit) return;
      if (!hoveredUnit || !hoveredTile) return;
      tilePressRef.current = { unit: hoveredUnit, startX: event.clientX, startY: event.clientY };
    };

    const handlePointerUp = () => {
      if (!tilePressRef.current) return;
      const { unit } = tilePressRef.current;
      tilePressRef.current = null;
      setTileMenu({ row: unit.position.row, col: unit.position.col, unit });
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [battleState, draggingUnit, hoveredTile, hoveredUnit, setTileMenu]);

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
          <h1>🎮 Battle Board {debugMode && <span className="debug-badge">DEBUG</span>}</h1>
          <p className="header-subtitle">Login to plan your placements.</p>
        </div>
      </div>
    );
  }

  if (armyLoading) {
    return (
      <div className="board-view-container">
        <div className="board-view-header">
          <h1>🎮 Battle Board {debugMode && <span className="debug-badge">DEBUG</span>}</h1>
          <p className="header-subtitle">Loading your army…</p>
        </div>
      </div>
    );
  }

  if (armyInstances.length === 0) {
    return (
      <div className="board-view-container">
        <div className="board-view-header">
          <h1>🎮 Battle Board {debugMode && <span className="debug-badge">DEBUG</span>}</h1>
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
        <h1>🎮 Battle Board {debugMode && <span className="debug-badge">DEBUG</span>}</h1>
        <p className="header-subtitle">{subtitle}</p>
      </div>

      <div className={`immersive-stage-panel ${battleState === 'idle' ? 'with-side' : ''}`}>
        {battleState === 'idle' ? (
          <div className="planning-stage-layout">
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
                  interactionMode="planning"
                  dragActive={Boolean(draggingUnit)}
                  onTileHover={handleTileHover}
                  onTileDrop={handleTileDrop}
                  onTileClick={handleTileClick}
                  forceOwner="blue"
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
              </div>
            </div>

            <div className="stage-side-dock">
              <div className="unit-stack-panel">
                <div className="panel-heading">
                  <h2>Available Units</h2>
                  <p>Drag a stack onto the close-up 6x6 grid. Yellow glow means the drop is valid; red means blocked.</p>
                </div>
                <div className="unit-stack-list">
                  {availableStacks.length === 0 ? (
                    <p className="stack-empty">All units are already deployed on the board.</p>
                  ) : (
                    availableStacks.map((stack) => (
                      <button
                        key={stack.unit.id}
                        type="button"
                        className="unit-stack-card"
                        onPointerDown={(event) => startStackDrag(event, stack.instances[0])}
                      >
                        <span className="stack-icon">{stack.unit.icon}</span>
                        <div className="stack-body">
                          <div className="stack-title">{stack.unit.name}</div>
                          <div className="stack-meta">{resolveSupplyCost(stack.unit.id, stack.unit)} supply each</div>
                        </div>
                        <span className="stack-count-badge">{stack.instances.length}</span>
                      </button>
                    ))
                  )}
                </div>
                <p className="panel-footer-note">Stacks shrink automatically as you place units.</p>
              </div>

              <div className="tile-inspector-card">
                <h2>Tile Inspector</h2>
                {hoveredTile ? (
                  <div className="tile-readout">
                    <div className="tile-coords-chip">Tile {hoveredTile.row + 1}, {hoveredTile.col + 1}</div>
                    {hoveredUnit ? (
                      <div className="tile-unit-details">
                        <div className="unit-icon-large">{hoveredUnit.icon}</div>
                        <div>
                          <h3>{hoveredUnit.name}</h3>
                          <p className="tile-unit-meta">Supply {resolveSupplyCost(hoveredUnit.id, hoveredUnit)}</p>
                          {hoveredUnit.selectedBehaviors && hoveredUnit.selectedBehaviors.length > 0 && (
                            <div className="tile-unit-behaviors">
                              {hoveredUnit.selectedBehaviors.map((behavior, idx) => (
                                <p key={idx} className="tile-unit-behavior">⚙️ {behavior}</p>
                              ))}
                            </div>
                          )}
                          <button
                            type="button"
                            className="tile-menu-btn"
                            onClick={() => setTileMenu({ row: hoveredUnit.position.row, col: hoveredUnit.position.col, unit: hoveredUnit })}
                          >
                            Manage unit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="tile-empty">No unit on this tile.</p>
                    )}
                  </div>
                ) : (
                  <p className="tile-empty">Hover over the board to inspect a tile.</p>
                )}
                <p className="panel-footer-note">Click an occupied tile to open unit actions.</p>
              </div>
            </div>
          </div>
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

      {draggingUnit && dragPosition && (
        <div className="drag-ghost" style={{ left: dragPosition.x, top: dragPosition.y }}>
          <span className="ghost-icon">{draggingUnit.unit.icon}</span>
          <span>{draggingUnit.unit.name}</span>
        </div>
      )}

      {tileMenu && (
        <div className="tile-menu-overlay" onClick={() => setTileMenu(null)}>
          <div className="tile-menu-card" onClick={(event) => event.stopPropagation()}>
            <div className="tile-menu-header">
              <h3>{tileMenu.unit.name}</h3>
              <p>Tile {tileMenu.row - PLANNING_ROW_OFFSET + 1}, {tileMenu.col + 1}</p>
            </div>
            <div className="tile-menu-actions">
              <button
                type="button"
                className="tile-menu-btn"
                onClick={() => beginMoveFromTile(tileMenu.unit)}
              >
                Move unit
              </button>
              <button
                type="button"
                className="tile-menu-btn"
                onClick={() => openLogicPanel(tileMenu.unit)}
              >
                Configure Logic
              </button>
              <button
                type="button"
                className="tile-menu-btn destructive"
                onClick={() => {
                  removePlacement(tileMenu.unit.instanceId);
                  setTileMenu(null);
                }}
              >
                Remove from board
              </button>
            </div>
          </div>
        </div>
      )}

      {syncedLogicPanelUnit && (
        <Suspense fallback={<div>Loading logic panel…</div>}>
          <UnitLogicPanel
            unit={syncedLogicPanelUnit}
            onBehaviorSelect={(behavior, categoryKey) => handleBehaviorSelect(syncedLogicPanelUnit.instanceId, behavior, categoryKey)}
            onClose={closeLogicPanel}
          />
        </Suspense>
      )}
    </div>
  );
};

export default BoardView;
