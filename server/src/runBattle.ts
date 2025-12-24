import type { PlacedUnit, Team, BattleEngineModule } from './battleTypes';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Load the built CJS bundle from the workspace root dist directory
const loadEngine = (): BattleEngineModule => {
  const attemptedPaths: string[] = [];
  const candidates = [
    // Common: server started from repo root
    resolve(process.cwd(), 'dist/engine/battleEngine.cjs'),
    // Common: server started from /server
    resolve(process.cwd(), '..', 'dist/engine/battleEngine.cjs'),
    // If this file is compiled into server/dist/... we can walk up to repo root
    resolve(__dirname, '../../../..', 'dist/engine/battleEngine.cjs'),
    // Dev container fallback
    '/workspaces/Armoria/dist/engine/battleEngine.cjs',
  ];

  for (const bundlePath of candidates) {
    attemptedPaths.push(bundlePath);

    try {
      if (!existsSync(bundlePath)) {
        continue;
      }

      // In dev, the engine bundle can change while the server stays up.
      // Bust require() cache so the next battle uses the latest logic.
      try {
        const resolved = require.resolve(bundlePath);
        if (require.cache[resolved]) {
          delete require.cache[resolved];
        }
      } catch {
        // ignore cache bust failures
      }

      return require(bundlePath) as BattleEngineModule;
    } catch {
      // try next candidate
    }
  }

  const err = new Error(
    `Cannot load battle engine. Tried:\n${attemptedPaths.map((p) => `- ${p}`).join('\n')}`
  );
  console.error('Failed to load battleEngine bundle:', err);
  throw err;
};
import type { ArmyConfig, BattleTickResult } from './types';

type Position = { row: number; col: number };

interface RunBattleResult {
  winner: 'A' | 'B' | 'draw';
  timeline: BattleTickResult[];
}

const TEAM_A: Team = 'player';
const TEAM_B: Team = 'enemy';

const MAX_TICKS = 500;

const cloneUnit = (unit: PlacedUnit, team: Team): PlacedUnit => ({
  ...unit,
  team,
  position: { ...unit.position },
  currentHp: unit.currentHp ?? unit.hp,
  currentShield: unit.currentShield ?? unit.shield ?? 0,
});

// Pre-battle normalization
// - Team A: keep positions as-is, set team to 'player'
const normalizeArmy = (army: ArmyConfig, team: Team): PlacedUnit[] =>
  army.map((unit) => cloneUnit(unit, team));

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
  const { advanceBattleTick, initializeBattle, BOARD_SIZE } = loadEngine();
  const maxRowIndex = BOARD_SIZE - 1;

  const mirrorPosition = (pos: Position): Position => ({
    row: maxRowIndex - pos.row,
    col: pos.col,
  });

  const normalizedArmyA = normalizeArmy(armyA, TEAM_A);
  const normalizedArmyB = armyB.map((unit) => {
    const cloned = cloneUnit(unit, TEAM_B);
    cloned.position = mirrorPosition(cloned.position);
    return cloned;
  });

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
export function mirrorTimelineForPlayerB(timeline: BattleTickResult[]): BattleTickResult[] {
  const { BOARD_SIZE } = loadEngine();
  const maxRowIndex = BOARD_SIZE - 1;
  const swapTeam = (team: Team): Team => (team === 'player' ? 'enemy' : 'player');
  const mirrorPosition = (pos: Position): Position => ({ row: maxRowIndex - pos.row, col: pos.col });
  const mirrorCellKey = (key: string): string => {
    const [rowStr, colStr] = key.split('-');
    const row = Number(rowStr);
    const col = Number(colStr);
    if (Number.isNaN(row) || Number.isNaN(col)) return key;
    return `${maxRowIndex - row}-${col}`;
  };

  return timeline.map((frame) => ({
    ...frame,
    units: frame.units.map((u) => ({
      ...u,
      position: mirrorPosition(u.position),
      team: swapTeam(u.team),
    })),
    hits: frame.hits.map(mirrorCellKey),
    moves: frame.moves.map(mirrorCellKey),
    hitEvents: frame.hitEvents.map((e) => ({
      ...e,
      attackerTeam: swapTeam(e.attackerTeam),
      attackerPosition: mirrorPosition(e.attackerPosition),
      targetPosition: mirrorPosition(e.targetPosition),
    })),
    winner: frame.winner ? swapTeam(frame.winner) : null,
    currentTeam: swapTeam(frame.currentTeam),
  }));
}
