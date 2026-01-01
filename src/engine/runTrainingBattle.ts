import type { PlacedUnit } from '../types';
import { advanceBattleTick, type BattleTickResult, type Team } from './battleEngine';
import { validatePlacementsInBounds } from '../utils/validatePlacementsInBounds';
import { BOARD_COLS, BOARD_SIZE } from './battleEngine';

export type TrainingBattleWinner = Team | 'draw';

export type TrainingBattleResult = {
  winner: TrainingBattleWinner;
  timeline: BattleTickResult[];
};

const MAX_TICKS = 500;

const cloneUnitForBattle = (unit: PlacedUnit): PlacedUnit => ({
  ...unit,
  position: { ...unit.position },
  currentHp: unit.currentHp ?? unit.hp,
  currentShield: unit.currentShield ?? unit.shield ?? 0,
});

/**
 * Deterministic local runner used by Training.
 *
 * - Does NOT call initializeBattle() (which uses luckyDraw randomness)
 * - Reuses the core tick logic (advanceBattleTick)
 */
export function runTrainingBattle(params: {
  playerUnits: PlacedUnit[];
  enemyUnits: PlacedUnit[];
  playerGoesFirst: boolean;
  maxTicks?: number;
  mode?: 'training';
}): TrainingBattleResult {
  if (params.mode && params.mode !== 'training') {
    throw new Error('runTrainingBattle is restricted to training mode.');
  }

  const startingTeam: Team = params.playerGoesFirst ? 'player' : 'enemy';
  const maxTicks = params.maxTicks ?? MAX_TICKS;
  const rawUnits = [...params.playerUnits, ...params.enemyUnits];

  const bounds = validatePlacementsInBounds(rawUnits, BOARD_COLS, BOARD_SIZE);
  if (!bounds.ok) {
    const { unitId, col, row } = bounds.error;
    throw new Error(`Invalid drill config: unit out of bounds: ${unitId} at (${col},${row})`);
  }

  const initialUnits = rawUnits.map(cloneUnitForBattle);

  const timeline: BattleTickResult[] = [
    {
      units: initialUnits.map(cloneUnitForBattle),
      hits: [],
      hitEvents: [],
      moves: [],
      winner: null,
      currentTeam: startingTeam,
      turnNumber: 0,
    },
  ];

  let units = initialUnits;
  let currentTeam: Team = startingTeam;
  let turnNumber = 1;

  for (let safetyCounter = 0; safetyCounter < maxTicks; safetyCounter += 1) {
    const tick = advanceBattleTick(units, currentTeam, turnNumber);
    timeline.push(tick);

    if (tick.winner) {
      return { winner: tick.winner, timeline };
    }

    units = tick.units;
    currentTeam = tick.currentTeam;
    turnNumber = tick.turnNumber;
  }

  return { winner: 'draw', timeline };
}
