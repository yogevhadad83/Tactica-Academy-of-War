import type { PlacedUnit, Position, Unit } from '../types';
import type { HitEvent } from '../types/battle';
import { applyAttackToUnit } from './attackResolution';

export type { PlacedUnit } from '../types';

/**
 * BOARD CONFIGURATION - Single Source of Truth
 * 
 * These constants define the battle board dimensions:
 * - BOARD_SIZE: Total rows (12) - full vertical height of the board
 * - BOARD_COLS: Total columns (6) - full horizontal width of the board
 * - PLAYER_ROWS: Rows available for each player's deployment zone (6)
 * - PLAYER_ZONE_START: Starting row for player's deployment zone (6)
 * 
 * The board is 12 rows x 6 columns:
 * - Rows 0-5: Enemy deployment zone (from player perspective)
 * - Rows 6-11: Player deployment zone
 * 
 * These values are exported to:
 * - dist/engine/battleEngine.cjs (generated bundle used by the server)
 * - All client components that need board dimensions
 */
export const BOARD_SIZE = 12;
export const BOARD_COLS = 6;
export const PLAYER_ROWS = 6;
export const PLAYER_ZONE_START = BOARD_SIZE - PLAYER_ROWS;

export const DEFAULT_ENEMY_FORMATION: Position[] = [
  { row: 0, col: 1 },
  { row: 0, col: 3 },
  { row: 0, col: 5 },
  { row: 1, col: 2 },
  { row: 1, col: 4 },
  { row: 2, col: 1 },
  { row: 2, col: 5 }
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

const forwardEnemyCount = (
  snapshot: PlacedUnit[],
  startRow: number,
  col: number,
  direction: number,
  actorTeam: PlacedUnit['team']
): number => {
  // Counts ENEMIES (not allies) from the next step to the board edge in the given column.
  // "Path" = the remaining tiles ahead until the unit reaches the end of the board.
  let enemies = 0;
  for (let row = startRow + direction; row >= 0 && row < BOARD_SIZE; row += direction) {
    const occupant = getOccupant(snapshot, row, col);
    if (occupant && occupant.team !== actorTeam) {
      enemies += 1;
    }
  }
  return enemies;
};

const ARCHER_ID = 'archer';
const RECRUIT_ID = 'recruit';
// Archer ranged pattern ("forward volley")
// - Excludes the tile directly in front (reserved for melee swipe)
// - Includes the two immediate diagonals (step 1, col +/- 1)
// - Includes a 3-wide lane for the next rows (steps 2..range+1, col -1/0/+1)
// This matches the design intent that archers shoot "into" the lane, not the adjacent tile directly in front.
const getArcherVolleyCells = (actor: PlacedUnit): Position[] => {
  const direction = directionForTeam(actor.team);
  const range = Math.max(1, actor.range);

  const cells: Position[] = [];

  // Step 1: diagonals only
  for (const colOffset of [-1, 1]) {
    const row = actor.position.row + direction * 1;
    const col = actor.position.col + colOffset;
    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_COLS) {
      cells.push({ row, col });
    }
  }

  // Steps 2..range+1: 3-wide volley
  for (let step = 2; step <= range + 1; step += 1) {
    const row = actor.position.row + direction * step;
    if (row < 0 || row >= BOARD_SIZE) break;
    for (const colOffset of [-1, 0, 1]) {
      const col = actor.position.col + colOffset;
      if (col >= 0 && col < BOARD_COLS) {
        cells.push({ row, col });
      }
    }
  }

  return cells;
};

const getArcherTargetBehavior = (actor: PlacedUnit): string => {
  const behaviors = actor.selectedBehaviors ?? [];
  return (
    behaviors.find((b) => b.startsWith('Target:')) ??
    behaviors.find((b) => b.startsWith('Target Preference:')) ??
    ''
  );
};

const getArcherPriority = (actor: PlacedUnit): 'Shooting' | 'Advancing' => {
  const behaviors = actor.selectedBehaviors ?? [];
  return behaviors.some((b) => b.includes('Priority: Advancing')) ? 'Advancing' : 'Shooting';
};

const findClosestTarget = (actor: PlacedUnit, candidates: PlacedUnit[], targetPreference?: string) => {
  const enemies = candidates.filter((unit) => unit.team !== actor.team && isAlive(unit));
  if (enemies.length === 0) return undefined;

  // Check if archer prefers strongest or weakest
  const preferStrongest = targetPreference?.includes('Strongest') ?? false;
  const preferWeakest = targetPreference?.includes('Weakest') ?? true; // default to weakest

  // Helper to calculate total effective health (HP + Shield)
  const getTotalHealth = (unit: PlacedUnit) => {
    const hp = unit.currentHp ?? unit.hp;
    const shield = unit.currentShield ?? unit.shield ?? 0;
    return hp + shield;
  };

  if (preferStrongest) {
    // Sort by total health (HP + Shield) descending (strongest first)
    enemies.sort((a, b) => getTotalHealth(b) - getTotalHealth(a));
  } else if (preferWeakest) {
    // Sort by total health (HP + Shield) ascending (weakest first)
    enemies.sort((a, b) => getTotalHealth(a) - getTotalHealth(b));
  }

  return enemies[0];
};

const findArcherForwardTarget = (actor: PlacedUnit, snapshot: PlacedUnit[]): PlacedUnit | undefined => {
  const candidates: PlacedUnit[] = [];

  for (const cell of getArcherVolleyCells(actor)) {
    const target = getOccupant(snapshot, cell.row, cell.col);
    if (target) {
      candidates.push(target);
    }
  }

  return findClosestTarget(actor, candidates, getArcherTargetBehavior(actor));
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

  const occupant = getOccupant(snapshot, nextRow, allyAtPosition.position.col);

  // Archer: move-vs-shoot depends on Priority
  if (allyAtPosition.id === ARCHER_ID) {
    const forwardTarget = findArcherForwardTarget(allyAtPosition, snapshot);
    const priority = getArcherPriority(allyAtPosition);

    // Default (Shooting): if it can shoot, it won't move.
    if (priority === 'Shooting' && forwardTarget) {
      return false;
    }

    // Advancing: if it can advance, it will (even if it has a target in range).
    if (priority === 'Advancing') {
      if (!occupant) return true;
      if (occupant.team !== allyAtPosition.team) return false;
      return willAllyMoveForward(occupant, snapshot, checkedUnits);
    }
  }

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
    const behaviors = actor.selectedBehaviors ?? [];
    const isRecruit = actor.id === RECRUIT_ID;
    const recruitMode: 'Aggressive' | 'Runner' | 'Moderate' = !isRecruit
      ? 'Moderate'
      : behaviors.some((b) => b.includes('Runner'))
        ? 'Runner'
        : behaviors.some((b) => b.includes('Aggressive'))
          ? 'Aggressive'
          : 'Moderate';

    if (isRecruit && (recruitMode === 'Runner' || recruitMode === 'Aggressive')) {
      // "Path" = remaining tiles ahead in the column until the unit reaches the board edge.
      // Runner: choose the lane with the LEAST ENEMIES.
      // Aggressive: choose the lane with the MOST ENEMIES.
      // In both cases, only sidestep if a side lane is STRICTLY better than the current lane.
      const direction = directionForTeam(actor.team);
      const currentCol = actor.position.col;
      const currentEnemies = forwardEnemyCount(snapshot, actor.position.row, currentCol, direction, actor.team);

      const getSide = (side: number): { col: number; enemies: number; canStep: boolean } | null => {
        const col = currentCol + side;
        if (col < 0 || col >= BOARD_COLS) return null;
        const blocked = !!getOccupant(snapshot, actor.position.row, col);
        const enemies = forwardEnemyCount(snapshot, actor.position.row, col, direction, actor.team);
        return { col, enemies, canStep: !blocked };
      };

      const left = getSide(-1);
      const right = getSide(1);
      // Deterministic tie-break: prefer RIGHT lane over LEFT when enemy counts tie.
      const sides = [right, left].filter(Boolean) as Array<{ col: number; enemies: number; canStep: boolean }>;
      const candidates = sides.filter((s) => s.canStep);

      if (candidates.length > 0) {
        if (recruitMode === 'Runner') {
          const best = candidates.reduce((acc, cur) => (cur.enemies < acc.enemies ? cur : acc), candidates[0]);
          if (best.enemies < currentEnemies) {
            actions.push({ actor, type: 'move', newPosition: { row: actor.position.row, col: best.col } });
            continue;
          }
        } else {
          const best = candidates.reduce((acc, cur) => (cur.enemies > acc.enemies ? cur : acc), candidates[0]);
          if (best.enemies > currentEnemies) {
            actions.push({ actor, type: 'move', newPosition: { row: actor.position.row, col: best.col } });
            continue;
          }
        }
      }
      // Otherwise fall through to normal behavior (move forward, fight, or idle)
    }

    // Check for archer forward attack first - but respect priority preference
    if (actor.id === ARCHER_ID) {
      const forwardTarget = findArcherForwardTarget(actor, snapshot);
      const priority = getArcherPriority(actor);

      if (priority === 'Advancing' && forwardTarget) {
        const direction = directionForTeam(actor.team);
        const nextRow = actor.position.row + direction;
        if (nextRow >= 0 && nextRow < BOARD_SIZE) {
          const occupant = getOccupant(snapshot, nextRow, actor.position.col);
          const canAdvance =
            !occupant ||
            (occupant.team === actor.team && willAllyMoveForward(occupant, snapshot, new Set([actor.instanceId])));

          if (canAdvance) {
            actions.push({
              actor,
              type: 'move',
              newPosition: { row: nextRow, col: actor.position.col }
            });
            continue;
          }
        }
      }

      // Priority: Shooting (default), or can't advance.
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

    // If blocked by ally or edge, try to attack nearest enemy.
    // IMPORTANT: Archers should not use generic Manhattan targeting; their ranged logic is fully defined
    // by the forward-volley pattern (handled above). They still get a melee swipe handled earlier.
    if (actor.id === ARCHER_ID) {
      continue;
    }

    const target = findClosestTarget(actor, snapshot, '');
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
