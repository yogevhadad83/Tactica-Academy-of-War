import type { PlacedUnit, Team, BattleEngineModule } from './battleTypes';

const {
  advanceBattleTick,
  initializeBattle,
  BOARD_SIZE,
  BOARD_COLS,
  PLAYER_ROWS,
} = require('../../src/engine/battleEngine.cjs') as BattleEngineModule;
import type { ArmyConfig, BattleTickResult } from './types';

type Position = { row: number; col: number };

interface RunBattleResult {
  winner: 'A' | 'B' | 'draw';
  timeline: BattleTickResult[];
}

const TEAM_A: Team = 'player';
const TEAM_B: Team = 'enemy';
const MAX_ROW_INDEX = BOARD_SIZE - 1;

const MAX_TICKS = 500;

const cloneUnit = (unit: PlacedUnit, team: Team): PlacedUnit => ({
  ...unit,
  team,
  position: { ...unit.position },
  currentHp: unit.currentHp ?? unit.hp,
  currentShield: unit.currentShield ?? unit.shield ?? 0,
});

const mirrorPositionVertically = (pos: Position): Position => ({
  row: MAX_ROW_INDEX - pos.row,
  col: pos.col,
});

// Pre-battle normalization
// - Team A: keep positions as-is, set team to 'player'
// - Team B: mirror vertically, set team to 'enemy'
const normalizeArmy = (
  army: ArmyConfig,
  team: Team,
  mirrorVertical: boolean
): PlacedUnit[] =>
  army.map((unit) => {
    const cloned = cloneUnit(unit, team);
    if (mirrorVertical) {
      cloned.position = mirrorPositionVertically(cloned.position);
    }
    return cloned;
  });

const mapWinner = (team: Team | null): 'A' | 'B' | 'draw' => {
  if (team === TEAM_A) {
    return 'A';
  }
  if (team === TEAM_B) {
    return 'B';
  }
  return 'draw';
};

/**
 * Runs a full deterministic battle between two armies on the server.
 * Challenger units become Team A ('player'); responder units become Team B ('enemy').
 */
export function runServerBattle(armyA: ArmyConfig, armyB: ArmyConfig): RunBattleResult {
  const normalizedArmyA = normalizeArmy(armyA, TEAM_A, false);
  const normalizedArmyB = normalizeArmy(armyB, TEAM_B, true);

  const initialState = initializeBattle([...normalizedArmyA, ...normalizedArmyB]);
  const timeline: BattleTickResult[] = [];

  // Push initial state as frame 0 (before any actions)
  // This allows the client to initialize unit positions correctly
  timeline.push({
    units: initialState.units.map(u => ({ ...u, position: { ...u.position } })),
    hits: [],
    hitEvents: [],
    moves: [],
    winner: null,
    currentTeam: initialState.currentTeam,
    turnNumber: 0, // Turn 0 = initial positioning, no actions yet
  });

  let currentState = initialState;
  let safetyCounter = 0;

  while (safetyCounter < MAX_TICKS) {
    const tickResult = advanceBattleTick(
      currentState.units,
      currentState.currentTeam,
      currentState.turnNumber
    );

    timeline.push(tickResult);

    if (tickResult.winner) {
      return { winner: mapWinner(tickResult.winner), timeline };
    }

    currentState = {
      units: tickResult.units,
      currentTeam: tickResult.currentTeam,
      turnNumber: tickResult.turnNumber,
    };

    safetyCounter += 1;
  }

  return { winner: 'draw', timeline };
}

// Post-battle timeline mirroring for Player B perspective
const swapTeam = (team: Team): Team => (team === 'player' ? 'enemy' : 'player');

const mirrorCellKey = (key: string): string => {
  const [rowStr, colStr] = key.split('-');
  const row = Number(rowStr);
  const col = Number(colStr);
  if (Number.isNaN(row) || Number.isNaN(col)) return key;
  return `${MAX_ROW_INDEX - row}-${col}`;
};

const mirrorFrameForPlayerB = (frame: BattleTickResult): BattleTickResult => {
  return {
    ...frame,
    units: frame.units.map((u) => ({
      ...u,
      position: mirrorPositionVertically(u.position),
      team: swapTeam(u.team),
    })),
    hits: frame.hits.map(mirrorCellKey),
    moves: frame.moves.map(mirrorCellKey),
    hitEvents: frame.hitEvents.map((e) => ({
      ...e,
      attackerTeam: swapTeam(e.attackerTeam),
      attackerPosition: mirrorPositionVertically(e.attackerPosition),
      targetPosition: mirrorPositionVertically(e.targetPosition),
    })),
    winner: frame.winner ? swapTeam(frame.winner) : null,
    currentTeam: swapTeam(frame.currentTeam),
  };
};

export function mirrorTimelineForPlayerB(timeline: BattleTickResult[]): BattleTickResult[] {
  return timeline.map((f) => mirrorFrameForPlayerB(f));
}
