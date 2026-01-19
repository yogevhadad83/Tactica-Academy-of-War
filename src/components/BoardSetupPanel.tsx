import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { boardKey } from '../constants/board';
import { BOARD_COLS, BOARD_SIZE, PLAYER_ZONE_START } from '../engine/battleEngine';
import type { ArmyUnitInstance, PlacedUnit, UnitLogic } from '../types';
import type { TileOccupant } from './createTacticalBoard';
import { mirrorOpponentBoardForDisplay } from '../utils/mirrorOpponentBoard';
import '../pages/BoardView.css';

const PlanningBoardStage = lazy(() => import('./PlanningBoardStage'));
const UnitLogicPanel = lazy(() => import('./UnitLogicPanel'));

const PLANNING_ROWS = 6;
const PLANNING_COLS = 6;
const PLANNING_ROW_OFFSET = PLAYER_ZONE_START;

export type ActiveArea = {
  colStart: number;
  cols: number;
  enemyRowStart: number;
  playerRowStart: number;
  rowsPerSide: number;
};

export type AllowedEdits = {
  repositions: number;
  behaviorChanges: number;
};

export type BoardSetupLocks = {
  restrictToActiveArea?: boolean;
  restrictToOwnZone?: boolean;
  disallowAddRemove?: boolean;
  enemyLocked?: boolean;
};

type BoardSetupPanelBaseProps = {
  mode: 'pvp' | 'training';

  activeArea?: ActiveArea;
  allowedEdits?: AllowedEdits;

  locks?: BoardSetupLocks;

  onRepositionUsed?: () => void;
  onBehaviorChangeUsed?: () => void;

  canEditBehavior?: (unit: PlacedUnit) => boolean;
};

export type BoardSetupPanelPvpProps = BoardSetupPanelBaseProps & {
  mode: 'pvp';

  armyInstances: ArmyUnitInstance[];
  placements: Record<string, { row: number; col: number }>;
  setPlacements: (next: Record<string, { row: number; col: number }> | ((prev: Record<string, { row: number; col: number }>) => Record<string, { row: number; col: number }>)) => void;

  unitLogic: UnitLogic;
  setUnitLogic: (next: UnitLogic | ((prev: UnitLogic) => UnitLogic)) => void;

  resolveSupplyCost: (unitTypeId: string, instance?: ArmyUnitInstance) => number;
  totalSupplyUsed: number;
  maxSupply: number;
  setSupplyError: (msg: string | null) => void;
};

export type BoardSetupPanelTrainingProps = BoardSetupPanelBaseProps & {
  mode: 'training';

  trainingBoard?: 'player' | 'full';

  playerUnits: PlacedUnit[];
  enemyUnits: PlacedUnit[];

  onChange: (nextPlayerUnits: PlacedUnit[], nextEnemyUnits: PlacedUnit[]) => void;
};

export type BoardSetupPanelProps = BoardSetupPanelPvpProps | BoardSetupPanelTrainingProps;

const isInsideActiveArea = (area: ActiveArea, row: number, col: number) => {
  const inCols = col >= area.colStart && col < area.colStart + area.cols;
  const inEnemyRows = row >= area.enemyRowStart && row < area.enemyRowStart + area.rowsPerSide;
  const inPlayerRows = row >= area.playerRowStart && row < area.playerRowStart + area.rowsPerSide;
  return inCols && (inEnemyRows || inPlayerRows);
};

const BoardSetupPanel = (props: BoardSetupPanelProps) => {
  const { mode, activeArea, allowedEdits, locks, onRepositionUsed, onBehaviorChangeUsed } = props;
  const canEditBehavior = props.canEditBehavior ?? (() => true);

  const trainingBoard: 'player' | 'full' =
    mode === 'training' ? (props.trainingBoard ?? 'player') : 'full';
  const isPlanningViewport = mode === 'pvp' || (mode === 'training' && trainingBoard === 'player');

  const trainingPlayerUsesPlanningCoords = useMemo(() => {
    if (mode !== 'training' || trainingBoard !== 'player') return false;
    if (!props.playerUnits.length) return false;
    return props.playerUnits.every(
      (unit) => unit.position.row >= 0 && unit.position.row < PLANNING_ROWS
    );
  }, [mode, props, trainingBoard]);

  const trainingPlayerRowOffset = useMemo(() => {
    if (mode !== 'training' || trainingBoard !== 'player') return 0;
    return trainingPlayerUsesPlanningCoords ? 0 : PLANNING_ROW_OFFSET;
  }, [mode, trainingBoard, trainingPlayerUsesPlanningCoords]);

  const effectiveLocks: Required<BoardSetupLocks> = {
    restrictToActiveArea: Boolean(locks?.restrictToActiveArea ?? Boolean(activeArea)),
    restrictToOwnZone: Boolean(locks?.restrictToOwnZone ?? true),
    disallowAddRemove: Boolean(locks?.disallowAddRemove ?? mode === 'training'),
    enemyLocked: Boolean(locks?.enemyLocked ?? mode === 'training')
  };

  const repositionsRemaining = allowedEdits?.repositions ?? Number.POSITIVE_INFINITY;
  const behaviorChangesRemaining = allowedEdits?.behaviorChanges ?? Number.POSITIVE_INFINITY;

  const allowReposition = repositionsRemaining > 0;
  const allowBehaviorEdit = behaviorChangesRemaining > 0;

  const [hoveredTile, setHoveredTile] = useState<{ row: number; col: number; occupied: boolean } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

  const [tileMenu, setTileMenu] = useState<{ row: number; col: number; unit: PlacedUnit } | null>(null);
  const [logicPanelUnit, setLogicPanelUnit] = useState<PlacedUnit | null>(null);

  const [draggingStackUnit, setDraggingStackUnit] = useState<{ unit: ArmyUnitInstance } | null>(null);
  const [draggingPlacedUnit, setDraggingPlacedUnit] = useState<{ unit: PlacedUnit; original: { row: number; col: number } } | null>(null);
  const [dragSourceOverride, setDragSourceOverride] = useState<{ row: number; col: number } | null>(null);
  const [hiddenDraggedUnitId, setHiddenDraggedUnitId] = useState<string | null>(null);
  const [stageReady, setStageReady] = useState(false);

  // Synchronous mirrors of drag state so drop/hover logic never depends on React timing.
  const draggingStackRef = useRef<{ unit: ArmyUnitInstance } | null>(null);
  const draggingPlacedRef = useRef<{ unit: PlacedUnit; original: { row: number; col: number } } | null>(null);

  const tilePressRef = useRef<{ unit: PlacedUnit; startX: number; startY: number } | null>(null);
  const DRAG_START_THRESHOLD = 6;

  const stageBoardRows = isPlanningViewport ? PLANNING_ROWS : BOARD_SIZE;
  const stageBoardCols = isPlanningViewport ? PLANNING_COLS : BOARD_COLS;

  const resolveSupplyCostSafe = useCallback(
    (unitId: string, instanceId?: string) => {
      if (mode !== 'pvp') return 0;
      const instance = props.armyInstances.find((u) => u.instanceId === instanceId);
      return props.resolveSupplyCost(unitId, instance);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, (props as any).armyInstances, (props as any).resolveSupplyCost]
  );

  const pvpUnitByInstanceId = useMemo(() => {
    if (mode !== 'pvp') return {} as Record<string, ArmyUnitInstance>;
    return props.armyInstances.reduce(
      (acc, unit) => {
        acc[unit.instanceId] = unit;
        return acc;
      },
      {} as Record<string, ArmyUnitInstance>
    );
  }, [mode, props]);

  const pvpPlacedUnits: PlacedUnit[] = useMemo(() => {
    if (mode !== 'pvp') return [];
    const { placements, unitLogic, armyInstances } = props;
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
  }, [mode, props]);

  const pvpQueueUnits = useMemo(() => {
    if (mode !== 'pvp') return [] as ArmyUnitInstance[];
    const { placements, armyInstances } = props;
    return armyInstances.filter((unit) => !placements[unit.instanceId]);
  }, [mode, props]);

  const availableStacks = useMemo(() => {
    if (mode !== 'pvp') return [] as Array<{ unit: ArmyUnitInstance; instances: ArmyUnitInstance[] }>;
    const stacks = new Map<string, { unit: ArmyUnitInstance; instances: ArmyUnitInstance[] }>();
    pvpQueueUnits.forEach((unit) => {
      const existing = stacks.get(unit.id) ?? { unit, instances: [] };
      existing.unit = unit;
      existing.instances.push(unit);
      stacks.set(unit.id, existing);
    });
    return Array.from(stacks.values());
  }, [mode, pvpQueueUnits]);

  const trainingAllUnits = useMemo(() => {
    if (mode !== 'training') return [] as PlacedUnit[];
    return [...props.enemyUnits, ...props.playerUnits];
  }, [mode, props]);

  const trainingPlayerPlanningUnits = useMemo(() => {
    if (mode !== 'training' || trainingBoard !== 'player') return [] as PlacedUnit[];
    return props.playerUnits
      .map((u) => ({
        ...u,
        position: {
          row: u.position.row - trainingPlayerRowOffset,
          col: u.position.col
        }
      }))
      .filter(
        (u) =>
          u.position.row >= 0 &&
          u.position.row < PLANNING_ROWS &&
          u.position.col >= 0 &&
          u.position.col < PLANNING_COLS
      );
  }, [mode, props, trainingBoard, trainingPlayerRowOffset]);

  const stageUnits = useMemo(() => {
    const filterHidden = (units: PlacedUnit[]) =>
      hiddenDraggedUnitId ? units.filter((u) => u.instanceId !== hiddenDraggedUnitId) : units;

    if (mode === 'pvp') {
      // Shift positions into the 6x6 planning view.
      return filterHidden(
        pvpPlacedUnits
        .map((unit) => ({
          ...unit,
          position: { row: unit.position.row - PLANNING_ROW_OFFSET, col: unit.position.col }
        }))
        .filter(
          (unit) =>
            unit.position.row >= 0 &&
            unit.position.row < PLANNING_ROWS &&
            unit.position.col >= 0 &&
            unit.position.col < PLANNING_COLS
        )
      );
    }

    if (trainingBoard === 'player') {
      return filterHidden(trainingPlayerPlanningUnits);
    }

    return filterHidden(trainingAllUnits);
  }, [hiddenDraggedUnitId, mode, pvpPlacedUnits, trainingAllUnits, trainingBoard, trainingPlayerPlanningUnits]);

  const draggingUnitLabel = useMemo(() => {
    if (draggingStackUnit) return { icon: draggingStackUnit.unit.icon, name: draggingStackUnit.unit.name };
    if (draggingPlacedUnit) return { icon: draggingPlacedUnit.unit.icon, name: draggingPlacedUnit.unit.name };
    return null;
  }, [draggingPlacedUnit, draggingStackUnit]);

  // Compute drag source tile for indicators (planning coords)
  const dragSourceTile = useMemo(() => {
    if (dragSourceOverride) return dragSourceOverride;
    if (!draggingPlacedUnit) return null;
    const { unit } = draggingPlacedUnit;
    if (mode === 'pvp') {
      return { row: unit.position.row - PLANNING_ROW_OFFSET, col: unit.position.col };
    }
    if (trainingBoard === 'player') {
      return { row: unit.position.row - trainingPlayerRowOffset, col: unit.position.col };
    }
    // opponent preview in training
    return null;
  }, [dragSourceOverride, draggingPlacedUnit, mode, trainingBoard, trainingPlayerRowOffset]);

  // Compute drag hover tile for indicators (planning coords)
  const dragHoverTile = useMemo(() => {
    if (!hoveredTile) return null;
    return { row: hoveredTile.row, col: hoveredTile.col };
  }, [hoveredTile]);

  const hoveredUnit = useMemo(() => {
    if (!hoveredTile) return null;

    if (mode === 'pvp') {
      const boardRow = hoveredTile.row + PLANNING_ROW_OFFSET;
      return pvpPlacedUnits.find((unit) => unit.position.row === boardRow && unit.position.col === hoveredTile.col) ?? null;
    }

    if (trainingBoard === 'player') {
      const boardRow = hoveredTile.row + trainingPlayerRowOffset;
      return props.playerUnits.find((unit) => unit.position.row === boardRow && unit.position.col === hoveredTile.col) ?? null;
    }

    return trainingAllUnits.find((unit) => unit.position.row === hoveredTile.row && unit.position.col === hoveredTile.col) ?? null;
  }, [hoveredTile, mode, pvpPlacedUnits, trainingAllUnits, trainingBoard, props]);

  const endDrag = useCallback(() => {
    setDraggingStackUnit(null);
    setDraggingPlacedUnit(null);
    setDragSourceOverride(null);
    setHiddenDraggedUnitId(null);
    setDragPosition(null);
    setHoveredTile(null);
    draggingStackRef.current = null;
    draggingPlacedRef.current = null;
  }, []);

  const canPlaceOnTile = useCallback(
    (team: 'player' | 'enemy', boardRow: number, col: number) => {
      if (effectiveLocks.restrictToOwnZone) {
        if (team === 'player' && boardRow < PLAYER_ZONE_START) return false;
        if (team === 'enemy' && boardRow >= PLAYER_ZONE_START) return false;
      }
      if (effectiveLocks.restrictToActiveArea && activeArea) {
        if (!isInsideActiveArea(activeArea, boardRow, col)) return false;
      }
      return true;
    },
    [activeArea, effectiveLocks.restrictToActiveArea, effectiveLocks.restrictToOwnZone]
  );

  const commitPlacementPvp = useCallback(
    (unit: ArmyUnitInstance, targetBoardRow: number, targetCol: number) => {
      if (mode !== 'pvp') return false;

      // Planning bounds are expressed in board coords.
      const inPlanningBounds =
        targetBoardRow >= PLANNING_ROW_OFFSET &&
        targetBoardRow < PLANNING_ROW_OFFSET + PLANNING_ROWS &&
        targetCol >= 0 &&
        targetCol < PLANNING_COLS;

      if (!inPlanningBounds) return false;

      const occupying = pvpPlacedUnits.find((placed) => placed.position.row === targetBoardRow && placed.position.col === targetCol);
      if (occupying) return false;

      const unitSupply = props.resolveSupplyCost(unit.id, unit);
      const alreadyPlaced = Boolean(props.placements[unit.instanceId]);
      const projectedSupply = props.totalSupplyUsed + (alreadyPlaced ? 0 : unitSupply);
      if (projectedSupply > props.maxSupply) {
        props.setSupplyError(`Supply cap reached (${props.maxSupply}). Remove a unit to add another.`);
        return false;
      }

      props.setSupplyError(null);
      props.setPlacements((prev) => ({ ...prev, [unit.instanceId]: { row: targetBoardRow, col: targetCol } }));
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, pvpPlacedUnits, props]
  );

  const commitMoveTraining = useCallback(
    (unit: PlacedUnit, targetBoardRow: number, targetCol: number) => {
      if (mode !== 'training') return false;

      if (effectiveLocks.enemyLocked && unit.team === 'enemy') return false;
      if (!allowReposition) return false;
      if (!canPlaceOnTile(unit.team, targetBoardRow, targetCol)) return false;

      const occupancyPool = trainingBoard === 'player' ? props.playerUnits : trainingAllUnits;
      const occupied = occupancyPool.some(
        (u) => u.instanceId !== unit.instanceId && u.position.row === targetBoardRow && u.position.col === targetCol
      );
      if (occupied) return false;

      const old = unit.position;
      const changed = old.row !== targetBoardRow || old.col !== targetCol;

      const nextPlayer = props.playerUnits.map((u) =>
        u.instanceId === unit.instanceId ? { ...u, position: { row: targetBoardRow, col: targetCol } } : u
      );

      const nextEnemy = props.enemyUnits;
      props.onChange(nextPlayer, nextEnemy);

      if (changed) {
        onRepositionUsed?.();
      }

      return true;
    },
    [
      allowReposition,
      canPlaceOnTile,
      effectiveLocks.enemyLocked,
      mode,
      onRepositionUsed,
      props,
      trainingAllUnits,
      trainingBoard
    ]
  );

  const startStackDrag = useCallback(
    (event: ReactPointerEvent, unit: ArmyUnitInstance) => {
      if (mode !== 'pvp') return;
      if (!allowReposition) return;
      event.preventDefault();
      setDragSourceOverride(null);
      draggingStackRef.current = { unit };
      setDraggingStackUnit({ unit });
      setDragPosition({ x: event.clientX, y: event.clientY });
      setTileMenu(null);
    },
    [allowReposition, mode]
  );

  const beginMoveFromTile = useCallback(
    (unit: PlacedUnit) => {
      setTileMenu(null);
      setDragSourceOverride(null);

      if (mode === 'pvp') {
        const instance = pvpUnitByInstanceId[unit.instanceId];
        if (!instance) return;
        setDragSourceOverride({ row: unit.position.row - PLANNING_ROW_OFFSET, col: unit.position.col });
        props.setPlacements((prev) => {
          const next = { ...prev };
          delete next[unit.instanceId];
          return next;
        });
        draggingStackRef.current = { unit: instance };
        setDraggingStackUnit({ unit: instance });
        setDragPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        return;
      }

      if (mode === 'training') {
        if (effectiveLocks.enemyLocked && unit.team === 'enemy') return;
        if (!allowReposition) return;
        const original = { ...unit.position };
        draggingPlacedRef.current = { unit, original };
        setDraggingPlacedUnit({ unit, original });
        // Match PvP behavior: hide the unit while dragging so it does not animate a 3D walk after drop.
        setHiddenDraggedUnitId(unit.instanceId);
        setDragPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      }
    },
    [
      allowReposition,
      effectiveLocks.enemyLocked,
      mode,
      pvpUnitByInstanceId,
      props
    ]
  );

  const handleTileHover = useCallback((info: { row: number; col: number; occupied: TileOccupant | null }) => {
    if (info.row < 0 || info.col < 0) {
      setHoveredTile(null);
      return;
    }
    setHoveredTile({ row: info.row, col: info.col, occupied: Boolean(info.occupied) });
  }, []);

  const handleTileDrop = useCallback(
    ({ row, col, occupied }: { row: number; col: number; occupied: TileOccupant | null }) => {
      const stackDrag = draggingStackRef.current ?? draggingStackUnit;
      const placedDrag = draggingPlacedRef.current ?? draggingPlacedUnit;

      if (row < 0 || col < 0) {
        // Cancellation
        if (mode === 'training' && placedDrag && effectiveLocks.disallowAddRemove) {
          // Restore if a move was cancelled.
          const original = placedDrag.original;
          const unit = placedDrag.unit;
          const restoredPlayer = props.playerUnits.map((u) =>
            u.instanceId === unit.instanceId ? { ...u, position: { ...original } } : u
          );
          props.onChange(restoredPlayer, props.enemyUnits);
        }
        endDrag();
        return;
      }

      if (occupied) {
        endDrag();
        return;
      }

      if (mode === 'pvp') {
        if (!stackDrag) {
          endDrag();
          return;
        }
        const boardRow = row + PLANNING_ROW_OFFSET;
        commitPlacementPvp(stackDrag.unit, boardRow, col);
        endDrag();
        return;
      }

      if (mode === 'training') {
        if (!placedDrag) {
          endDrag();
          return;
        }
        const boardRow = trainingBoard === 'player' ? row + trainingPlayerRowOffset : row;
        commitMoveTraining(placedDrag.unit, boardRow, col);
        endDrag();
      }
    },
    [
      commitMoveTraining,
      commitPlacementPvp,
      draggingPlacedUnit,
      draggingStackUnit,
      effectiveLocks.disallowAddRemove,
      endDrag,
      mode,
      props,
      trainingBoard,
      trainingPlayerRowOffset
    ]
  );

  const canDropOnPlanningTile = useCallback(
    (row: number, col: number) => {
      if (row < 0 || col < 0) return false;

      const stackDrag = draggingStackRef.current;
      const placedDrag = draggingPlacedRef.current;

      if (mode === 'pvp') {
        const active = stackDrag ?? draggingStackUnit;
        if (!active) return false;
        const targetBoardRow = row + PLANNING_ROW_OFFSET;

        const inPlanningBounds =
          targetBoardRow >= PLANNING_ROW_OFFSET &&
          targetBoardRow < PLANNING_ROW_OFFSET + PLANNING_ROWS &&
          col >= 0 &&
          col < PLANNING_COLS;
        if (!inPlanningBounds) return false;

        const occupying = pvpPlacedUnits.some(
          (placed) => placed.position.row === targetBoardRow && placed.position.col === col
        );
        if (occupying) return false;

        const unit = active.unit;
        const unitSupply = props.resolveSupplyCost(unit.id, unit);
        const alreadyPlaced = Boolean(props.placements[unit.instanceId]);
        const projectedSupply = props.totalSupplyUsed + (alreadyPlaced ? 0 : unitSupply);
        if (projectedSupply > props.maxSupply) return false;

        return true;
      }

      if (mode === 'training') {
        const active = placedDrag ?? draggingPlacedUnit;
        if (!active) return false;
        const unit = active.unit;
        if (effectiveLocks.enemyLocked && unit.team === 'enemy') return false;
        if (!allowReposition) return false;

        const targetBoardRow = trainingBoard === 'player' ? row + trainingPlayerRowOffset : row;
        if (!canPlaceOnTile(unit.team, targetBoardRow, col)) return false;

        const occupancyPool = trainingBoard === 'player' ? props.playerUnits : trainingAllUnits;
        const occupied = occupancyPool.some(
          (u) => u.instanceId !== unit.instanceId && u.position.row === targetBoardRow && u.position.col === col
        );
        if (occupied) return false;

        return true;
      }

      return false;
    },
    [
      allowReposition,
      canPlaceOnTile,
      draggingPlacedUnit,
      draggingStackUnit,
      effectiveLocks.enemyLocked,
      mode,
      props,
      pvpPlacedUnits,
      trainingAllUnits,
      trainingBoard,
      trainingPlayerRowOffset
    ]
  );

  const disabledCells = useMemo(() => {
    if (mode !== 'training') return [] as string[];
    const rows = stageBoardRows;
    const cols = stageBoardCols;
    const result: string[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const boardRow = trainingBoard === 'player' ? r + trainingPlayerRowOffset : r;
        if (!canPlaceOnTile('player', boardRow, c)) {
          result.push(boardKey(r, c));
        }
      }
    }
    return result;
  }, [canPlaceOnTile, mode, stageBoardCols, stageBoardRows, trainingBoard, trainingPlayerRowOffset]);

  const enemyPreviewDisabledCells = useMemo(() => {
    if (mode !== 'training') return [] as string[];
    if (trainingBoard !== 'player') return [] as string[];

    const result: string[] = [];
    for (let r = 0; r < PLANNING_ROWS; r += 1) {
      for (let c = 0; c < PLANNING_COLS; c += 1) {
        if (!canPlaceOnTile('enemy', r, c)) {
          result.push(boardKey(r, c));
        }
      }
    }
    return result;
  }, [activeArea, canPlaceOnTile, mode, trainingBoard]);

  const handleTileClick = useCallback(
    ({ row, col }: { row: number; col: number; occupied: TileOccupant | null }) => {
      if (mode === 'pvp') {
        const boardRow = row + PLANNING_ROW_OFFSET;
        const unit = pvpPlacedUnits.find((placed) => placed.position.row === boardRow && placed.position.col === col);
        if (!unit) return;
        setTileMenu({ row: boardRow, col, unit });
        return;
      }

      if (trainingBoard === 'player') {
        const boardRow = row + trainingPlayerRowOffset;
        const unit = props.playerUnits.find((placed) => placed.position.row === boardRow && placed.position.col === col);
        if (!unit) return;
        setTileMenu({ row: boardRow, col, unit });
        return;
      }

      const unit = trainingAllUnits.find((placed) => placed.position.row === row && placed.position.col === col);
      if (!unit) return;
      setTileMenu({ row, col, unit });
    },
    [mode, pvpPlacedUnits, trainingAllUnits, trainingBoard, props, trainingPlayerRowOffset]
  );

  const openLogicPanel = useCallback((unit: PlacedUnit) => {
    if (!allowBehaviorEdit) return;
    if (!canEditBehavior(unit)) return;
    setLogicPanelUnit(unit);
    setTileMenu(null);
  }, [allowBehaviorEdit, canEditBehavior]);

  const closeLogicPanel = useCallback(() => {
    setLogicPanelUnit(null);
  }, []);

  const syncedLogicPanelUnit = useMemo(() => {
    if (!logicPanelUnit) return null;
    if (mode === 'pvp') {
      const updated = pvpPlacedUnits.find((u) => u.instanceId === logicPanelUnit.instanceId);
      return updated || logicPanelUnit;
    }
    const updated = (trainingBoard === 'player' ? props.playerUnits : trainingAllUnits).find(
      (u) => u.instanceId === logicPanelUnit.instanceId
    );
    return updated || logicPanelUnit;
  }, [logicPanelUnit, mode, pvpPlacedUnits, trainingAllUnits, trainingBoard, props]);

  const getDefaultBehaviorsForUnit = useCallback((behaviorOptions: string[]): string[] => {
    if (!behaviorOptions.length) return [];

    const categories = new Map<string, string[]>();
    for (const fullBehavior of behaviorOptions) {
      const colonIndex = fullBehavior.indexOf(':');
      if (colonIndex <= -1) continue;
      const category = fullBehavior.slice(0, colonIndex).trim();
      if (!category) continue;
      const existing = categories.get(category) ?? [];
      existing.push(fullBehavior);
      categories.set(category, existing);
    }

    if (categories.size === 0) return [behaviorOptions[0]];

    const defaults: string[] = [];
    for (const [, options] of categories) {
      if (options.length) defaults.push(options[0]);
    }
    return defaults;
  }, []);

  const handleBehaviorSelect = useCallback(
    (instanceId: string, behavior: string, categoryKey?: string) => {
      if (!allowBehaviorEdit) return;

      if (mode === 'pvp') {
        props.setUnitLogic((prev) => {
          const currentBehaviors = prev[instanceId] ?? [];
          const before = currentBehaviors;

          let after: string[];

          if (categoryKey) {
            const behaviorOptions = pvpUnitByInstanceId[instanceId]?.behaviorOptions ?? [];
            const defaults = getDefaultBehaviorsForUnit(behaviorOptions);

            const seededBehaviors = defaults.reduce((acc, def) => {
              const colonIndex = def.indexOf(':');
              if (colonIndex <= -1) return acc;
              const category = def.slice(0, colonIndex).trim();
              if (!category) return acc;

              const hasCategory = acc.some((b) => b.startsWith(`${category}:`));
              return hasCategory ? acc : [...acc, def];
            }, currentBehaviors);

            const withoutCategory = seededBehaviors.filter((b) => !b.startsWith(`${categoryKey}:`));
            after = [...withoutCategory, behavior];
          } else {
            after = [behavior];
          }

          if (before.join('|') !== after.join('|')) {
            onBehaviorChangeUsed?.();
          }

          return { ...prev, [instanceId]: after };
        });
        return;
      }

      if (mode === 'training') {
        const all = trainingAllUnits;
        const currentUnit = all.find((u) => u.instanceId === instanceId);
        const currentSelected = currentUnit?.selectedBehaviors ?? [];

        let nextSelected: string[];

        if (categoryKey) {
          const behaviorOptions = currentUnit?.behaviorOptions ?? [];
          const defaults = getDefaultBehaviorsForUnit(behaviorOptions);

          const seededBehaviors = defaults.reduce((acc, def) => {
            const colonIndex = def.indexOf(':');
            if (colonIndex <= -1) return acc;
            const category = def.slice(0, colonIndex).trim();
            if (!category) return acc;

            const hasCategory = acc.some((b) => b.startsWith(`${category}:`));
            return hasCategory ? acc : [...acc, def];
          }, currentSelected);

          const withoutCategory = seededBehaviors.filter((b) => !b.startsWith(`${categoryKey}:`));
          nextSelected = [...withoutCategory, behavior];
        } else {
          nextSelected = [behavior];
        }

        if (currentSelected.join('|') !== nextSelected.join('|')) {
          onBehaviorChangeUsed?.();
        }

        const nextPlayer = props.playerUnits.map((u) =>
          u.instanceId === instanceId ? { ...u, selectedBehaviors: nextSelected } : u
        );

        props.onChange(nextPlayer, props.enemyUnits);
      }
    },
    [
      allowBehaviorEdit,
      getDefaultBehaviorsForUnit,
      mode,
      onBehaviorChangeUsed,
      pvpUnitByInstanceId,
      props,
      trainingAllUnits
    ]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (tilePressRef.current) {
        const { startX, startY, unit } = tilePressRef.current;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (Math.hypot(dx, dy) >= DRAG_START_THRESHOLD) {
          beginMoveFromTile(unit);
          tilePressRef.current = null;
          return;
        }
      }

      if (!draggingStackUnit && !draggingPlacedUnit) return;
      setDragPosition({ x: event.clientX, y: event.clientY });
    },
    [DRAG_START_THRESHOLD, beginMoveFromTile, draggingPlacedUnit, draggingStackUnit]
  );

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [handlePointerMove]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (draggingStackUnit || draggingPlacedUnit) return;
      if (!hoveredUnit || !hoveredTile) return;

      if (mode === 'training' && effectiveLocks.enemyLocked && hoveredUnit.team === 'enemy') return;
      if (!allowReposition) return;

      tilePressRef.current = { unit: hoveredUnit, startX: event.clientX, startY: event.clientY };
    };

    const handlePointerUp = () => {
      // Handle tile tap (no drag) -> open tile menu
      if (tilePressRef.current) {
        const { unit } = tilePressRef.current;
        tilePressRef.current = null;
        setTileMenu({ row: unit.position.row, col: unit.position.col, unit });
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [
    allowReposition,
    draggingPlacedUnit,
    draggingStackUnit,
    effectiveLocks.enemyLocked,
    endDrag,
    hoveredTile,
    hoveredUnit,
    mode,
    trainingBoard,
    props
  ]);

  const enemyPreviewUnits = useMemo(() => {
    if (mode !== 'training') return [] as PlacedUnit[];
    // Enemy units live in rows 0-5 (enemy zone). For the opponent preview we keep
    // the same orientation so row 5 stays closest to the camera (no mirroring).
    const enemyUsesPlanningCoords =
      props.enemyUnits.length > 0 && props.enemyUnits.every((unit) => unit.position.row >= 0 && unit.position.row < PLANNING_ROWS);
    const enemyRowOffset = enemyUsesPlanningCoords ? 0 : PLANNING_ROW_OFFSET;

    return mirrorOpponentBoardForDisplay(props.enemyUnits, {
      boardRows: PLANNING_ROWS,
      boardCols: PLANNING_COLS,
      rowOffset: enemyRowOffset,
      forceTeam: 'enemy',
      mirror: false
    });
  }, [mode, props]);

  return (
    <div className="planning-stage-layout">
      <div className="immersive-stage-card">
        {!stageReady && (
          <div className="stage-loading" role="status" aria-live="polite">
            Loading battlefield...
          </div>
        )}
        <Suspense
          fallback={
            <div className="stage-loading" role="status" aria-live="polite">
              Preparing tactical canvas…
            </div>
          }
        >
          <PlanningBoardStage
            owner="player"
            boardSize={stageBoardRows}
            boardCols={stageBoardCols}
            units={stageUnits}
            disabledCells={disabledCells}
            dragActive={Boolean(draggingStackUnit || draggingPlacedUnit)}
            canDropOnTile={canDropOnPlanningTile}
            onTileHover={handleTileHover}
            onTileDrop={handleTileDrop}
            onTileClick={handleTileClick}
            onReady={setStageReady}
            dragSourceTile={dragSourceTile}
            dragHoverTile={dragHoverTile}
          />
        </Suspense>
      </div>

      <div className="stage-side-dock">
        {mode === 'pvp' ? (
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
                    disabled={!allowReposition}
                  >
                    <span className="stack-icon">{stack.unit.icon}</span>
                    <div className="stack-body">
                      <div className="stack-title">{stack.unit.name}</div>
                      <div className="stack-meta">{props.resolveSupplyCost(stack.unit.id, stack.unit)} supply each</div>
                    </div>
                    <span className="stack-count-badge">{stack.instances.length}</span>
                  </button>
                ))
              )}
            </div>
            <p className="panel-footer-note">Stacks shrink automatically as you place units.</p>
          </div>
        ) : (
          <div className="unit-stack-panel">
            <div className="panel-heading">
              <h2>Edit Budget</h2>
              <p>Repositions and behavior changes are limited for this drill.</p>
            </div>
            <div className="unit-stack-list">
              <div className="stack-empty">
                Repositions remaining: {Number.isFinite(repositionsRemaining) ? repositionsRemaining : '∞'}
              </div>
              <div className="stack-empty">
                Behavior changes remaining: {Number.isFinite(behaviorChangesRemaining) ? behaviorChangesRemaining : '∞'}
              </div>
            </div>
            <p className="panel-footer-note">
              {allowReposition ? 'Drag to reposition units.' : 'Repositioning locked.'} {allowBehaviorEdit ? '' : 'Behavior edits locked.'}
            </p>
          </div>
        )}

        {mode === 'training' && trainingBoard === 'player' && (
          <div className="tile-inspector-card training-opponent-preview">
            <h2>Opponent Board</h2>
            <Suspense
              fallback={
                <div className="stage-loading" role="status" aria-live="polite">
                  Preparing opponent preview…
                </div>
              }
            >
              <PlanningBoardStage
                owner="opponent"
                boardSize={PLANNING_ROWS}
                boardCols={PLANNING_COLS}
                units={enemyPreviewUnits}
                disabledCells={enemyPreviewDisabledCells}
                dragActive={false}
              />
            </Suspense>
            <p className="panel-footer-note">Preview only. Enemy deployment is locked.</p>
          </div>
        )}

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
                    {mode === 'pvp' && (
                      <p className="tile-unit-meta">Supply {resolveSupplyCostSafe(hoveredUnit.id, hoveredUnit.instanceId)}</p>
                    )}
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

      {(draggingStackUnit || draggingPlacedUnit) && dragPosition && draggingUnitLabel && (
        <div className="drag-ghost" style={{ left: dragPosition.x, top: dragPosition.y }}>
          <span className="ghost-icon">{draggingUnitLabel.icon}</span>
          <span>{draggingUnitLabel.name}</span>
        </div>
      )}

      {tileMenu && (
        <div className="tile-menu-overlay" onClick={() => setTileMenu(null)}>
          <div className="tile-menu-card" onClick={(event) => event.stopPropagation()}>
            <div className="tile-menu-header">
              <h3>{tileMenu.unit.name}</h3>
              <p>
                Tile{' '}
                {isPlanningViewport
                  ? `${tileMenu.row - (mode === 'training' && trainingBoard === 'player' ? trainingPlayerRowOffset : PLANNING_ROW_OFFSET) + 1}, ${tileMenu.col + 1}`
                  : `${tileMenu.row + 1}, ${tileMenu.col + 1}`}
              </p>
            </div>
            <div className="tile-menu-actions">
              <button
                type="button"
                className="tile-menu-btn"
                onClick={() => beginMoveFromTile(tileMenu.unit)}
                disabled={!allowReposition || (mode === 'training' && effectiveLocks.enemyLocked && tileMenu.unit.team === 'enemy')}
              >
                Move unit
              </button>
              <button
                type="button"
                className="tile-menu-btn"
                onClick={() => openLogicPanel(tileMenu.unit)}
                disabled={!allowBehaviorEdit || !canEditBehavior(tileMenu.unit)}
              >
                Configure Logic
              </button>
              {mode === 'pvp' && !effectiveLocks.disallowAddRemove && (
                <button
                  type="button"
                  className="tile-menu-btn destructive"
                  onClick={() => {
                    props.setPlacements((prev) => {
                      const next = { ...prev };
                      delete next[tileMenu.unit.instanceId];
                      return next;
                    });
                    setTileMenu(null);
                  }}
                >
                  Remove from board
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {syncedLogicPanelUnit && (
        <Suspense fallback={<div>Loading logic panel…</div>}>
          <UnitLogicPanel
            unit={syncedLogicPanelUnit}
            onBehaviorSelect={(behavior, categoryKey) =>
              handleBehaviorSelect(syncedLogicPanelUnit.instanceId, behavior, categoryKey)
            }
            onClose={closeLogicPanel}
          />
        </Suspense>
      )}
    </div>
  );
};

export default BoardSetupPanel;
