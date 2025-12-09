import type { PlacedUnit, Position, Unit } from '../types';

/**
 * BOARD CONFIGURATION
 * These constants should match battleEngine.ts (the single source of truth).
 * They define a 12x8 board with 6-row deployment zones for each player.
 */
export const BOARD_SIZE = 12;
export const BOARD_COLS = 8;
export const PLAYER_ROWS = 6;
export const PLAYER_ZONE_START = BOARD_SIZE - PLAYER_ROWS;

export const ENEMY_FORMATION: Position[] = [
  { row: 0, col: 2 },
  { row: 0, col: 4 },
  { row: 0, col: 6 },
  { row: 0, col: 8 },
  { row: 1, col: 3 },
  { row: 1, col: 5 },
  { row: 1, col: 7 },
  { row: 2, col: 2 },
  { row: 2, col: 6 },
  { row: 2, col: 9 }
];

export type Team = 'player' | 'enemy';

export interface DemoState {
  units: PlacedUnit[];
  currentTeam: Team;
  turnNumber: number;
}

export interface DemoTickResult {
  units: PlacedUnit[];
  hits: string[];
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
    currentHp: unit.currentHp ?? unit.hp
  }));

const isAlive = (unit: PlacedUnit) => (unit.currentHp ?? unit.hp) > 0;

const manhattan = (a: Position, b: Position) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

const getOccupant = (units: PlacedUnit[], row: number, col: number): PlacedUnit | undefined =>
  units.find((unit) => isAlive(unit) && unit.position.row === row && unit.position.col === col);

const directionForTeam = (team: PlacedUnit['team']) => (team === 'player' ? -1 : 1);

const targetRowForTeam = (team: PlacedUnit['team']) => (team === 'player' ? 0 : BOARD_SIZE - 1);

const attackNearest = (
  actor: PlacedUnit,
  snapshot: PlacedUnit[]
): PlacedUnit | null => {
  const foes = snapshot
    .filter((unit) => unit.team !== actor.team && isAlive(unit))
    .sort((a, b) => manhattan(actor.position, a.position) - manhattan(actor.position, b.position));

  if (foes.length === 0) {
    return null;
  }

  const target = foes[0];
  const distance = manhattan(actor.position, target.position);
  const range = Math.max(1, actor.range);
  if (distance > range) {
    return null;
  }

  return target;
};

/** Collects all pending actions from a team's units without applying them yet */
interface PendingAction {
  actor: PlacedUnit;
  type: 'move' | 'attack';
  targetUnit?: PlacedUnit;
  newPosition?: Position;
}

const collectTeamActions = (
  team: Team,
  snapshot: PlacedUnit[]
): PendingAction[] => {
  const actions: PendingAction[] = [];
  const teamUnits = snapshot.filter((unit) => unit.team === team && isAlive(unit));

  for (const actor of teamUnits) {
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
          targetUnit: occupant
        });
        continue;
      }
    }

    // If blocked by ally or edge, try to attack nearest enemy
    const target = attackNearest(actor, snapshot);
    if (target) {
      actions.push({
        actor,
        type: 'attack',
        targetUnit: target
      });
    }
  }

  return actions;
};

/** Apply all collected actions simultaneously */
const applyActions = (
  actions: PendingAction[],
  snapshot: PlacedUnit[],
  recordMove: (key: string) => void,
  recordHit: (key: string) => void
): void => {
  // Apply all attacks simultaneously (damage is calculated based on pre-action state)
  const damageMap = new Map<string, number>();
  
  for (const action of actions) {
    if (action.type === 'attack' && action.targetUnit) {
      const targetId = action.targetUnit.instanceId;
      const currentDamage = damageMap.get(targetId) ?? 0;
      damageMap.set(targetId, currentDamage + action.actor.damage);
    }
  }

  // Apply accumulated damage and record hits
  for (const [targetId, totalDamage] of damageMap) {
    const target = snapshot.find((unit) => unit.instanceId === targetId);
    if (target) {
      target.currentHp = Math.max(0, (target.currentHp ?? target.hp) - totalDamage);
      recordHit(`${target.position.row}-${target.position.col}`);
    }
  }

  // Apply all moves simultaneously
  const moveActions = actions.filter((action) => action.type === 'move' && action.newPosition);
  
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
      // and no unit currently occupies that cell (after accounting for deaths)
      const currentOccupant = getOccupant(snapshot, action.newPosition.row, action.newPosition.col);
      
      if (movesToCell.length === 1 && !currentOccupant) {
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
 * Advances the training battle by one turn.
 * All units of the current team act simultaneously, then the turn passes to the other team.
 */
export const advanceTrainingBattle = (
  units: PlacedUnit[],
  currentTeam: Team,
  turnNumber: number
): DemoTickResult => {
  const snapshot = cloneUnits(units);
  const hits: string[] = [];
  const moves: string[] = [];

  // Collect and apply all actions for the current team simultaneously
  const actions = collectTeamActions(currentTeam, snapshot);
  applyActions(
    actions,
    snapshot,
    (key) => moves.push(key),
    (key) => hits.push(key)
  );

  // Check for winner after actions
  const winner = evaluateWinner(snapshot);

  // Prepare for next turn (switch teams)
  const nextTeam = otherTeam(currentTeam);
  const nextTurnNumber = turnNumber + 1;

  return {
    units: snapshot,
    hits,
    moves,
    winner,
    currentTeam: nextTeam,
    turnNumber: nextTurnNumber
  };
};

/** Creates the initial training battle state with a lucky draw to determine starting team */
export const initializeTrainingBattle = (units: PlacedUnit[]): DemoState => {
  const startingTeam = luckyDraw();
  return {
    units: cloneUnits(units),
    currentTeam: startingTeam,
    turnNumber: 1
  };
};

export const buildTrainingEnemyArmy = (template: Unit, formation: Position[]): PlacedUnit[] => {
  // Temporary change for testing: return a single enemy unit (use the first formation position)
  const pos = formation && formation.length > 0 ? formation[0] : { row: 0, col: 0 };
  return [
    {
      ...template,
      team: 'enemy' as const,
      position: { ...pos },
      instanceId: `demo-enemy-0`,
      currentHp: template.hp
    }
  ];
};
