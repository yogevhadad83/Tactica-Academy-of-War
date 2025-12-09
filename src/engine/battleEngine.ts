import type { PlacedUnit, Position, Unit } from '../types';
import type { HitEvent } from '../types/battle';
import { applyAttackToUnit } from './attackResolution';

export type { PlacedUnit } from '../types';

/**
 * BOARD CONFIGURATION - Single Source of Truth
 * 
 * These constants define the battle board dimensions:
 * - BOARD_SIZE: Total rows (12) - full vertical height of the board
 * - BOARD_COLS: Total columns (8) - full horizontal width of the board
 * - PLAYER_ROWS: Rows available for each player's deployment zone (6)
 * - PLAYER_ZONE_START: Starting row for player's deployment zone (6)
 * 
 * The board is 12 rows x 8 columns:
 * - Rows 0-5: Enemy deployment zone (from player perspective)
 * - Rows 6-11: Player deployment zone
 * 
 * These values are exported to:
 * - battleEngine.cjs (for server-side battle resolution)
 * - All client components that need board dimensions
 */
export const BOARD_SIZE = 12;
export const BOARD_COLS = 8;
export const PLAYER_ROWS = 6;
export const PLAYER_ZONE_START = BOARD_SIZE - PLAYER_ROWS;

export const DEFAULT_ENEMY_FORMATION: Position[] = [
  { row: 0, col: 2 },
  { row: 0, col: 4 },
  { row: 0, col: 6 },
  { row: 1, col: 3 },
  { row: 1, col: 5 },
  { row: 2, col: 2 },
  { row: 2, col: 6 }
];

export type Team = 'player' | 'enemy';

export interface BattleState {
  units: PlacedUnit[];
  currentTeam: Team;
  turnNumber: number;
}

export interface BattleTickResult {
  units: PlacedUnit[];
  hits: string[];
  hitEvents: HitEvent[];
  moves: string[];
  winner: Team | null;
  currentTeam: Team;
  turnNumber: number;
}

/** Randomly picks which team starts the battle */
export const luckyDraw = (): Team => (Math.random() < 0.5 ? 'player' : 'enemy');

/** Returns the opposing team */
const otherTeam = (team: Team): Team => (team === 'player' ? 'enemy' : 'player');

const cloneUnits = (units: PlacedUnit[]): PlacedUnit[] =>
  units.map((unit) => ({
    ...unit,
    position: { ...unit.position },
    currentHp: unit.currentHp ?? unit.hp,
    currentShield: unit.currentShield ?? unit.shield ?? 0
  }));

const isAlive = (unit: PlacedUnit) => (unit.currentHp ?? unit.hp) > 0;

const manhattan = (a: Position, b: Position) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

const getOccupant = (units: PlacedUnit[], row: number, col: number): PlacedUnit | undefined =>
  units.find((unit) => isAlive(unit) && unit.position.row === row && unit.position.col === col);

const directionForTeam = (team: PlacedUnit['team']) => (team === 'player' ? -1 : 1);

const targetRowForTeam = (team: PlacedUnit['team']) => (team === 'player' ? 0 : BOARD_SIZE - 1);

const ARCHER_ID = 'archer';
const ARCHER_FORWARD_RANGE = 5; // keep constant for now; future player configs can override
const ARCHER_FORWARD_COLUMN_OFFSETS = [-1, 0, 1];

const findClosestTarget = (actor: PlacedUnit, candidates: PlacedUnit[]) =>
  candidates
    .filter((unit) => unit.team !== actor.team && isAlive(unit))
    .sort((a, b) => manhattan(actor.position, a.position) - manhattan(actor.position, b.position))[0];

const findArcherForwardTarget = (actor: PlacedUnit, snapshot: PlacedUnit[]): PlacedUnit | undefined => {
  const direction = directionForTeam(actor.team);
  const validCols = ARCHER_FORWARD_COLUMN_OFFSETS.map((offset) => actor.position.col + offset).filter(
    (col) => col >= 0 && col < BOARD_COLS
  );
  const candidates: PlacedUnit[] = [];
  for (let step = 1; step <= ARCHER_FORWARD_RANGE; step += 1) {
    const row = actor.position.row + direction * step;
    if (row < 0 || row >= BOARD_SIZE) {
      break;
    }
    for (const col of validCols) {
      const target = getOccupant(snapshot, row, col);
      if (target) {
        candidates.push(target);
      }
    }
  }
  return findClosestTarget(actor, candidates);
};

/** Collects all pending actions from a team's units without applying them yet */
interface PendingAction {
  actor: PlacedUnit;
  type: 'move' | 'attack';
  targetPosition?: Position;
  targetUnit?: PlacedUnit;
  attackType?: 'melee' | 'ranged';
  newPosition?: Position;
}

/** Check if an ally unit at a given position will move forward this turn */
const willAllyMoveForward = (
  allyAtPosition: PlacedUnit,
  snapshot: PlacedUnit[],
  checkedUnits: Set<string>
): boolean => {
  // Prevent infinite recursion
  if (checkedUnits.has(allyAtPosition.instanceId)) {
    return false;
  }
  checkedUnits.add(allyAtPosition.instanceId);

  const direction = directionForTeam(allyAtPosition.team);
  const nextRow = allyAtPosition.position.row + direction;

  // Can't move if at board edge
  if (nextRow < 0 || nextRow >= BOARD_SIZE) {
    return false;
  }

  // Check for archer forward attack - if archer has a target, it won't move
  if (allyAtPosition.id === ARCHER_ID) {
    const forwardTarget = findArcherForwardTarget(allyAtPosition, snapshot);
    if (forwardTarget) {
      return false; // Archer will attack instead of move
    }
  }

  const occupant = getOccupant(snapshot, nextRow, allyAtPosition.position.col);

  if (!occupant) {
    // No one in front, ally will move
    return true;
  }

  if (occupant.team !== allyAtPosition.team) {
    // Enemy in front, ally will attack instead of move
    return false;
  }

  // Ally in front - check if that ally will also move forward (recursively)
  return willAllyMoveForward(occupant, snapshot, checkedUnits);
};

const collectTeamActions = (
  team: Team,
  snapshot: PlacedUnit[]
): PendingAction[] => {
  const actions: PendingAction[] = [];
  const teamUnits = snapshot.filter((unit) => unit.team === team && isAlive(unit));

  for (const actor of teamUnits) {
    // Check for archer forward attack first
    if (actor.id === ARCHER_ID) {
      const forwardTarget = findArcherForwardTarget(actor, snapshot);
      if (forwardTarget) {
        actions.push({
          actor,
          type: 'attack',
          targetUnit: forwardTarget,
          targetPosition: { ...forwardTarget.position },
          attackType: 'ranged'
        });
        continue;
      }
    }

    const direction = directionForTeam(actor.team);
    const nextRow = actor.position.row + direction;
    
    // Check if can move forward
    if (nextRow >= 0 && nextRow < BOARD_SIZE) {
      const occupant = getOccupant(snapshot, nextRow, actor.position.col);
      
      if (!occupant) {
        // Can move forward
        actions.push({
          actor,
          type: 'move',
          newPosition: { row: nextRow, col: actor.position.col }
        });
        continue;
      }
      
      if (occupant.team !== actor.team) {
        // Attack the enemy in front
        actions.push({
          actor,
          type: 'attack',
          targetUnit: occupant,
          targetPosition: { ...occupant.position },
          attackType: 'melee'
        });
        continue;
      }

      // Ally in front - check if ally will move forward, allowing this unit to follow
      if (willAllyMoveForward(occupant, snapshot, new Set([actor.instanceId]))) {
        actions.push({
          actor,
          type: 'move',
          newPosition: { row: nextRow, col: actor.position.col }
        });
        continue;
      }
    }

    // If blocked by ally or edge, try to attack nearest enemy
    const target = findClosestTarget(actor, snapshot);
    if (target) {
      const distance = manhattan(actor.position, target.position);
      const range = Math.max(1, actor.range);
      if (distance <= range) {
        // For melee attacks (range 1), only allow attacking enemies directly in front
        // (same column), not to the sides
        const isMeleeRange = range === 1;
        const isDirectlyInFront = target.position.col === actor.position.col;
        
        if (isMeleeRange && !isDirectlyInFront) {
          // Melee unit cannot attack sideways - skip this action
          continue;
        }
        
        actions.push({
          actor,
          type: 'attack',
          targetUnit: target,
          targetPosition: { ...target.position },
          attackType: distance > 1 ? 'ranged' : 'melee'
        });
      }
    }
  }

  return actions;
};

/** Apply all collected actions simultaneously */
const applyActions = (
  actions: PendingAction[],
  snapshot: PlacedUnit[],
  recordMove: (key: string) => void,
  recordHit: (attacker: PlacedUnit, target: PlacedUnit, attackType: 'melee' | 'ranged', didKill: boolean) => void
): void => {
  // Apply attacks one by one using deterministic resolution rules
  for (const action of actions) {
    if (action.type === 'attack' && action.targetUnit && action.attackType) {
      const targetUnit = action.targetUnit; // Type narrowing for TypeScript
      const target = snapshot.find((unit) => unit.instanceId === targetUnit.instanceId);
      if (!target || !isAlive(target)) {
        continue;
      }

      applyAttackToUnit(action.actor, target);
      const didKill = !isAlive(target);
      recordHit(action.actor, target, action.attackType, didKill);
    }
  }

  // Apply all moves simultaneously
  const moveActions = actions.filter((action) => action.type === 'move' && action.newPosition);
  const moveActionsByActorId = new Map<string, PendingAction>();
  for (const action of moveActions) {
    moveActionsByActorId.set(action.actor.instanceId, action);
  }
  
  // Check for move collisions (two units moving to the same cell)
  const targetCells = new Map<string, PendingAction[]>();
  for (const action of moveActions) {
    if (action.newPosition) {
      const key = `${action.newPosition.row}-${action.newPosition.col}`;
      const existing = targetCells.get(key) ?? [];
      existing.push(action);
      targetCells.set(key, existing);
    }
  }

  // Execute non-colliding moves
  for (const action of moveActions) {
    if (action.newPosition) {
      const key = `${action.newPosition.row}-${action.newPosition.col}`;
      const movesToCell = targetCells.get(key) ?? [];
      
      // Only move if this is the only unit trying to move there
      // and the cell is either empty or will be vacated by an ally also moving this turn
      const currentOccupant = getOccupant(snapshot, action.newPosition.row, action.newPosition.col);
      const occupantWillVacate = !!currentOccupant && moveActionsByActorId.has(currentOccupant.instanceId);

      if (movesToCell.length === 1 && (!currentOccupant || occupantWillVacate)) {
        recordMove(`${action.actor.position.row}-${action.actor.position.col}`);
        action.actor.position = { ...action.newPosition };
        recordMove(`${action.actor.position.row}-${action.actor.position.col}`);
      }
    }
  }
};

const evaluateWinner = (units: PlacedUnit[]): Team | null => {
  const playerReached = units.some(
    (unit) => unit.team === 'player' && isAlive(unit) && unit.position.row === targetRowForTeam('player')
  );
  if (playerReached) {
    return 'player';
  }
  const enemyReached = units.some(
    (unit) => unit.team === 'enemy' && isAlive(unit) && unit.position.row === targetRowForTeam('enemy')
  );
  if (enemyReached) {
    return 'enemy';
  }

  return null;
};

/**
 * Advances the battle by one turn.
 * All units of the current team act simultaneously, then the turn passes to the other team.
 */
export const advanceBattleTick = (
  units: PlacedUnit[],
  currentTeam: Team,
  turnNumber: number
): BattleTickResult => {
  const snapshot = cloneUnits(units);
  const hits: string[] = [];
  const hitEvents: HitEvent[] = [];
  const moves: string[] = [];
  let hitSequence = 0;

  const recordHitEvent = (
    attacker: PlacedUnit,
    target: PlacedUnit,
    attackType: 'melee' | 'ranged',
    didKill: boolean
  ) => {
    const cellKey = `${target.position.row}-${target.position.col}`;
    hits.push(cellKey);
    hitEvents.push({
      // Include turnNumber to ensure unique IDs across turns
      id: `turn${turnNumber}-${attacker.instanceId}-${target.instanceId ?? 'unknown'}-${hitSequence += 1}`,
      attackerId: attacker.instanceId,
      attackerTeam: attacker.team,
      attackerPosition: { ...attacker.position },
      targetId: target.instanceId,
      targetPosition: { ...target.position },
      attackType,
      didKill
    });
  };

  // Collect and apply all actions for the current team simultaneously
  const actions = collectTeamActions(currentTeam, snapshot);
  applyActions(
    actions,
    snapshot,
    (key) => moves.push(key),
    recordHitEvent
  );

  // Check for winner after actions
  const winner = evaluateWinner(snapshot);

  // Prepare for next turn (switch teams)
  const nextTeam = otherTeam(currentTeam);
  const nextTurnNumber = turnNumber + 1;

  return {
    units: snapshot,
    hits,
    hitEvents,
    moves,
    winner,
    currentTeam: nextTeam,
    turnNumber: nextTurnNumber
  };
};

/** Creates the initial battle state with a lucky draw to determine starting team */
export const initializeBattle = (units: PlacedUnit[]): BattleState => {
  const startingTeam = luckyDraw();
  return {
    units: cloneUnits(units),
    currentTeam: startingTeam,
    turnNumber: 1
  };
};

export const buildEnemyArmy = (template: Unit, formation: Position[]): PlacedUnit[] =>
  formation.map((position, index) => ({
    ...template,
    team: 'enemy' as const,
    position: { ...position },
    instanceId: `enemy-${index}-${Math.random().toString(36).slice(2)}`,
    currentHp: template.hp
  }));
