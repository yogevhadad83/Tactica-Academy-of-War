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

test('Archer Target: Weakest in range chooses lowest HP enemy', () => {
  const archer = makeUnit({
    id: 'archer',
    name: 'Archer',
    team: 'player',
    position: { row: BOARD_SIZE - 2, col: 2 },
    range: 3,
    damage: 1,
    selectedBehaviors: ['Target: Weakest in range', 'Priority: Shooting'],
    instanceId: 'archer-weakest'
  });

  // Put two enemies in the archer volley pattern (excluding tile directly in front).
  const low = makeUnit({
    id: 'recruit',
    name: 'Low',
    team: 'enemy',
    position: { row: BOARD_SIZE - 4, col: 2 },
    hp: 2,
    currentHp: 1,
    instanceId: 'enemy-low'
  });

  const high = makeUnit({
    id: 'knight',
    name: 'High',
    team: 'enemy',
    // Place the stronger enemy one more row forward so both are in the volley cells.
    position: { row: BOARD_SIZE - 5, col: 2 },
    hp: 10,
    currentHp: 10,
    instanceId: 'enemy-high'
  });

  const { units: after } = advanceBattleTick([archer, low, high], 'player', 1);
  const afterLow = after.find((u) => u.instanceId === 'enemy-low');
  const afterHigh = after.find((u) => u.instanceId === 'enemy-high');
  assert.ok(afterLow && afterHigh);
  assert.strictEqual(afterLow.currentHp, 0, 'weakest target should be hit');
  assert.strictEqual(afterHigh.currentHp, 10, 'stronger target should not be hit');
});

test('Archer Target: Strongest in range chooses highest HP enemy', () => {
  const archer = makeUnit({
    id: 'archer',
    name: 'Archer',
    team: 'player',
    position: { row: BOARD_SIZE - 2, col: 2 },
    range: 3,
    damage: 1,
    selectedBehaviors: ['Target: Strongest in range', 'Priority: Shooting'],
    instanceId: 'archer-strongest'
  });

  const low = makeUnit({
    id: 'recruit',
    name: 'Low',
    team: 'enemy',
    position: { row: BOARD_SIZE - 4, col: 2 },
    hp: 2,
    currentHp: 1,
    instanceId: 'enemy-low2'
  });

  const high = makeUnit({
    id: 'knight',
    name: 'High',
    team: 'enemy',
    position: { row: BOARD_SIZE - 5, col: 2 },
    hp: 10,
    currentHp: 10,
    instanceId: 'enemy-high2'
  });

  const { units: after } = advanceBattleTick([archer, low, high], 'player', 1);
  const afterLow = after.find((u) => u.instanceId === 'enemy-low2');
  const afterHigh = after.find((u) => u.instanceId === 'enemy-high2');
  assert.ok(afterLow && afterHigh);
  assert.strictEqual(afterHigh.currentHp, 9, 'strongest target should be hit');
  assert.strictEqual(afterLow.currentHp, 1, 'weaker target should not be hit');
});

test('Archer Priority: Shooting attacks instead of advancing when target exists', () => {
  const archer = makeUnit({
    id: 'archer',
    name: 'Archer',
    team: 'player',
    position: { row: BOARD_SIZE - 2, col: 2 },
    range: 3,
    damage: 1,
    selectedBehaviors: ['Target: Weakest in range', 'Priority: Shooting'],
    instanceId: 'archer-shooting'
  });

  const enemy = makeUnit({
    id: 'recruit',
    name: 'Enemy',
    team: 'enemy',
    // In-range volley cell (step 2 straight ahead).
    position: { row: BOARD_SIZE - 4, col: 2 },
    hp: 2,
    currentHp: 2,
    instanceId: 'enemy-in-range'
  });

  const { units: after } = advanceBattleTick([archer, enemy], 'player', 1);
  const afterArcher = after.find((u) => u.instanceId === 'archer-shooting');
  const afterEnemy = after.find((u) => u.instanceId === 'enemy-in-range');
  assert.ok(afterArcher && afterEnemy);
  assert.deepStrictEqual(afterArcher.position, { row: BOARD_SIZE - 2, col: 2 }, 'archer should not advance');
  assert.strictEqual(afterEnemy.currentHp, 1, 'enemy should be hit');
});

test('Archer Priority: Advancing advances when possible even if target exists', () => {
  const startRow = BOARD_SIZE - 2;
  const archer = makeUnit({
    id: 'archer',
    name: 'Archer',
    team: 'player',
    position: { row: startRow, col: 2 },
    range: 3,
    damage: 1,
    selectedBehaviors: ['Target: Weakest in range', 'Priority: Advancing'],
    instanceId: 'archer-advancing'
  });

  const enemy = makeUnit({
    id: 'recruit',
    name: 'Enemy',
    team: 'enemy',
    // In-range volley cell; keep the tile directly in front empty so advancing is possible.
    position: { row: startRow - 2, col: 2 },
    hp: 2,
    currentHp: 2,
    instanceId: 'enemy-in-range2'
  });

  // Ensure the tile in front is empty so the archer can actually advance.
  enemy.position = { row: startRow - 3, col: 2 };

  const { units: after } = advanceBattleTick([archer, enemy], 'player', 1);
  const afterArcher = after.find((u) => u.instanceId === 'archer-advancing');
  const afterEnemy = after.find((u) => u.instanceId === 'enemy-in-range2');
  assert.ok(afterArcher && afterEnemy);
  assert.deepStrictEqual(afterArcher.position, { row: startRow - 1, col: 2 }, 'archer should advance');
  assert.strictEqual(afterEnemy.currentHp, 2, 'archer should not shoot this tick');
});

test('Archer Target: Strongest prioritizes HP + Shield combined', () => {
  const archer = makeUnit({
    id: 'archer',
    name: 'Archer',
    team: 'player',
    position: { row: BOARD_SIZE - 2, col: 2 },
    range: 3,
    damage: 1,
    selectedBehaviors: ['Target: Strongest in range', 'Priority: Shooting'],
    instanceId: 'archer-strongest-shield'
  });

  // Enemy with high HP but no shield (total: 10)
  const highHp = makeUnit({
    id: 'knight',
    name: 'HighHP',
    team: 'enemy',
    position: { row: BOARD_SIZE - 5, col: 2 },
    hp: 10,
    currentHp: 10,
    shield: 0,
    currentShield: 0,
    instanceId: 'enemy-high-hp'
  });

  // Enemy with medium HP but has shield (total: 5 + 8 = 13)
  const mediumHpWithShield = makeUnit({
    id: 'recruit',
    name: 'Shielded',
    team: 'enemy',
    position: { row: BOARD_SIZE - 4, col: 2 },
    hp: 5,
    currentHp: 5,
    shield: 8,
    currentShield: 8,
    instanceId: 'enemy-shielded'
  });

  const { units: after } = advanceBattleTick([archer, highHp, mediumHpWithShield], 'player', 1);
  const afterHighHp = after.find((u) => u.instanceId === 'enemy-high-hp');
  const afterShielded = after.find((u) => u.instanceId === 'enemy-shielded');
  assert.ok(afterHighHp && afterShielded);
  
  // Should target the shielded enemy (HP 5 + Shield 8 = 13 total) over high HP enemy (10 total)
  assert.strictEqual(afterHighHp.currentHp, 10, 'high HP enemy should not be hit');
  assert.strictEqual(afterShielded.currentHp, 5, 'shielded enemy HP should remain');
  assert.strictEqual(afterShielded.currentShield, 7, 'shielded enemy shield should be reduced by 1');
});
