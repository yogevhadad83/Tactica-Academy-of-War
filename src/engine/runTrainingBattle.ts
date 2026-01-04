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
  playArea?: {
    cols: number;
    rowsPerSide: number;
    colStart: number;
    playerRowStart: number;
    enemyRowStart: number;
  } | null;
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

  const checkPlayAreaVictory = () => {
    if (!params.playArea) return null as TrainingBattleWinner | null;
    const { cols, colStart, rowsPerSide, playerRowStart, enemyRowStart } = params.playArea;
    const playerBackEdge = playerRowStart + rowsPerSide; // enemy crossing here means enemy wins
    const enemyBackEdge = enemyRowStart; // player crossing above this means player wins

    for (const unit of units) {
      const { row, col } = unit.position;
      const inCols = col >= colStart && col < colStart + cols;
      const inRows = row >= enemyRowStart && row < playerBackEdge;
      if (!(inCols && inRows)) {
        // Unit has stepped outside the active lane; declare opposing side the loser and the mover's side the victor
        return unit.team;
      }

      // Forward progress beyond opponent back edge ends the battle in mover's favor
      if (unit.team === 'player' && row < enemyBackEdge) return 'player';
      if (unit.team === 'enemy' && row >= playerBackEdge) return 'enemy';
    }
    return null;
  };

  for (let safetyCounter = 0; safetyCounter < maxTicks; safetyCounter += 1) {
    const tick = advanceBattleTick(units, currentTeam, turnNumber);

    if (tick.winner) {
      timeline.push(tick);
      return { winner: tick.winner, timeline };
    }

    // Check playArea victory with the NEW positions from this tick
    const tempUnits = tick.units;
    units = tempUnits;
    const laneWinner = checkPlayAreaVictory();
    
    if (laneWinner) {
      // Don't add the tick that moved outside - end at the last valid position
      const lastFrame = timeline[timeline.length - 1];
      if (!lastFrame.winner) {
        lastFrame.winner = laneWinner as TrainingBattleWinner;
      }
      return { winner: laneWinner, timeline };
    }

    // Only add tick to timeline if playArea is still valid
    timeline.push(tick);
    currentTeam = tick.currentTeam;
    turnNumber = tick.turnNumber;
  }

  return { winner: 'draw', timeline };
}
