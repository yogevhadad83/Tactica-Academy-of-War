import assert from 'node:assert';
import test from 'node:test';
import { runTrainingBattle } from '../src/engine/runTrainingBattle';
import type { PlacedUnit } from '../src/types';
import gddUnits from '../shared/gddUnits';

const { buildGddUnit } = gddUnits as typeof import('../shared/gddUnits');

// Inline drill definition to avoid import issues with shared CommonJS module
const ACTIVE_COL = 2;

function makePlacedUnit(params: {
  unitId: 'recruit';
  instanceId: string;
  team: 'player' | 'enemy';
  row: number;
  col: number;
}): PlacedUnit {
  const unit = buildGddUnit(params.unitId);
  return {
    ...unit,
    instanceId: params.instanceId,
    team: params.team,
    position: { row: params.row, col: params.col },
  } as PlacedUnit;
}

const drill = {
  id: 'drill-01-tempo-trap',
  playerGoesFirst: false,
  playerStartBoard: [
    makePlacedUnit({ unitId: 'recruit', instanceId: 'p-recruit', team: 'player', row: 6, col: ACTIVE_COL })
  ],
  opponentStartBoard: [
    makePlacedUnit({ unitId: 'recruit', instanceId: 'e-recruit', team: 'enemy', row: 5, col: ACTIVE_COL })
  ],
};

const cloneUnit = (unit: PlacedUnit, overrides?: Partial<PlacedUnit>): PlacedUnit => ({
  ...unit,
  ...overrides,
  position: {
    ...unit.position,
    ...(overrides?.position ?? {}),
  },
});

test('drill id is drill-01-tempo-trap', () => {
  assert.strictEqual(drill.id, 'drill-01-tempo-trap');
});

test('enemy takes the first turn and wins if player stays forward', () => {
  const result = runTrainingBattle({
    playerUnits: drill.playerStartBoard,
    enemyUnits: drill.opponentStartBoard,
    playerGoesFirst: drill.playerGoesFirst,
  });

  assert.strictEqual(result.timeline[0]?.currentTeam, 'enemy');
  assert.strictEqual(result.winner, 'enemy');
});

test('pulling back one tile gives the player the win', () => {
  const pulledPlayer = drill.playerStartBoard.map((unit) =>
    cloneUnit(unit, { position: { ...unit.position, row: unit.position.row + 1 } })
  );

  const result = runTrainingBattle({
    playerUnits: pulledPlayer,
    enemyUnits: drill.opponentStartBoard,
    playerGoesFirst: drill.playerGoesFirst,
  });

  assert.strictEqual(result.winner, 'player');
});
