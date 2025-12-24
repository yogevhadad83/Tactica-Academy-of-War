import assert from 'node:assert';
import test from 'node:test';
import { advanceBattleTick, BOARD_SIZE } from '../src/engine/battleEngine';
import type { PlacedUnit } from '../src/types';

const makeUnit = (overrides: Partial<PlacedUnit>): PlacedUnit => ({
  id: overrides.id ?? 'unit',
  name: overrides.name ?? 'Unit',
  icon: overrides.icon ?? 'X',
  cost: overrides.cost ?? 0,
  hp: overrides.hp ?? 1,
  damage: overrides.damage ?? 1,
  defense: overrides.defense ?? 0,
  speed: overrides.speed ?? 1,
  range: overrides.range ?? 1,
  behaviorOptions: overrides.behaviorOptions ?? [],
  upgradeOptions: overrides.upgradeOptions ?? [],
  team: overrides.team ?? 'player',
  position: overrides.position ?? { row: 0, col: 0 },
  instanceId: overrides.instanceId ?? Math.random().toString(36).slice(2),
  currentHp: overrides.currentHp,
  currentShield: overrides.currentShield,
  shield: overrides.shield,
  selectedBehaviors: overrides.selectedBehaviors
});

test('Runner moves forward when its lane is not worse than sides', () => {
  const runner = makeUnit({
    id: 'recruit',
    name: 'Runner',
    position: { row: BOARD_SIZE - 2, col: 2 },
    team: 'player',
    selectedBehaviors: ['Runner'],
    instanceId: 'runner-1'
  });

  const { units: after } = advanceBattleTick([runner], 'player', 1);
  const moved = after.find((u) => u.instanceId === 'runner-1');
  assert.ok(moved, 'runner should still exist');
  assert.deepStrictEqual(moved?.position, { row: BOARD_SIZE - 3, col: 2 });
});

test('Runner sidesteps into a lane with fewer enemies on the path', () => {
  const runner = makeUnit({
    id: 'recruit',
    name: 'Runner',
    position: { row: BOARD_SIZE - 2, col: 2 },
    team: 'player',
    selectedBehaviors: ['Runner'],
    instanceId: 'runner-2'
  });

  // Put an ENEMY on its current path so that lane has more enemies than the side lanes
  const blocker = makeUnit({
    id: 'knight',
    name: 'Blocker',
    position: { row: BOARD_SIZE - 4, col: 2 },
    team: 'enemy',
    instanceId: 'blocker-1',
    hp: 5
  });

  const { units: after } = advanceBattleTick([runner, blocker], 'player', 1);
  const moved = after.find((u) => u.instanceId === 'runner-2');
  assert.ok(moved, 'runner should still exist');
  // Should step right because that lane has fewer enemies on the remaining path
  assert.deepStrictEqual(moved?.position, { row: BOARD_SIZE - 2, col: 3 });
});

test('Runner ignores allies when evaluating path enemies', () => {
  const runner = makeUnit({
    id: 'recruit',
    name: 'Runner',
    position: { row: BOARD_SIZE - 2, col: 2 },
    team: 'player',
    selectedBehaviors: ['Runner'],
    instanceId: 'runner-ally-ignore'
  });

  // Ally exists somewhere ahead in the same column.
  // Old logic counted ALL occupied tiles (including allies) and would sidestep.
  // New logic counts ENEMIES only, so this should NOT trigger a sidestep.
  const allyAhead = makeUnit({
    id: 'knight',
    name: 'AllyAhead',
    position: { row: BOARD_SIZE - 4, col: 2 },
    team: 'player',
    instanceId: 'ally-ahead',
    hp: 5
  });

  const { units: after } = advanceBattleTick([runner, allyAhead], 'player', 1);
  const moved = after.find((u) => u.instanceId === 'runner-ally-ignore');
  assert.ok(moved, 'runner should still exist');
  // Should move forward (no sidestep) because both lanes have 0 enemies on the path.
  assert.deepStrictEqual(moved?.position, { row: BOARD_SIZE - 3, col: 2 });
});
