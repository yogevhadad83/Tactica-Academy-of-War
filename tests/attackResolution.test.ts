import assert from 'node:assert';
import test from 'node:test';
import { applyAttackToUnit, resolveAttack } from '../src/engine/attackResolution';
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
  instanceId: overrides.instanceId ?? 'u-1',
  currentHp: overrides.currentHp,
  currentShield: overrides.currentShield,
  shield: overrides.shield
});

test('Knight (DMG 3) hits Beast (HP 6, DEF 1, no shield) for 2 HP', () => {
  const result = resolveAttack({ damage: 3, targetHp: 6, targetShield: 0, targetDefense: 1 });
  assert.strictEqual(result.newHp, 4);
  assert.strictEqual(result.damageToHp, 2);
  assert.strictEqual(result.newShield, 0);
});

test('Beast attacking Knight applies defense when no shield', () => {
  const knightHp = 190;
  const knightDefense = 16;
  const beastDamage = 34;
  const result = resolveAttack({ damage: beastDamage, targetHp: knightHp, targetShield: 0, targetDefense: knightDefense });
  assert.strictEqual(result.damageToHp, beastDamage - knightDefense);
  assert.strictEqual(result.newHp, knightHp - (beastDamage - knightDefense));
});

test('Shielded units absorb damage before defense is considered', () => {
  const defender = makeUnit({ hp: 10, shield: 5, defense: 50, currentShield: 5, team: 'enemy', instanceId: 'def-1' });
  const attacker = makeUnit({ damage: 3, team: 'player', instanceId: 'att-1' });
  const outcome = applyAttackToUnit(attacker, defender);

  assert.strictEqual(outcome.newShield, 2);
  assert.strictEqual(outcome.damageToHp, 0);
  assert.strictEqual(defender.currentHp, 10);
});

test('High defense reduces overflow but never below 1 once shield is gone', () => {
  const defender = makeUnit({ hp: 5, defense: 10, shield: 0, team: 'enemy', instanceId: 'def-2' });
  const attacker = makeUnit({ damage: 5, team: 'player', instanceId: 'att-2' });

  const outcome = applyAttackToUnit(attacker, defender);
  assert.strictEqual(outcome.damageToHp, 1);
  assert.strictEqual(defender.currentHp, 4);
});

test('Shield overflow is reduced by defense only after shield is broken', () => {
  const defender = makeUnit({ hp: 12, defense: 3, shield: 2, currentShield: 2, team: 'enemy', instanceId: 'def-3' });
  const attacker = makeUnit({ damage: 5, team: 'player', instanceId: 'att-3' });

  const outcome = applyAttackToUnit(attacker, defender);
  // 2 shield absorbed, overflow 3, defense 3 -> 0 hp damage
  assert.strictEqual(outcome.damageToHp, 0);
  assert.strictEqual(defender.currentHp, 12);
  assert.strictEqual(defender.currentShield, 0);
});
