import assert from 'node:assert';
import test from 'node:test';
import { buildGddUnit, GDD_UNIT_IDS, GDD_UNIT_DEFS } from '../shared/gddUnits';

test('all GDD unit ids resolve to a template', () => {
  for (const id of GDD_UNIT_IDS) {
    const unit = buildGddUnit(id);
    assert.ok(unit.name.length > 0, `${id} should have a name`);
    assert.ok(unit.hp >= 0, `${id} should have hp defined`);
    assert.ok(unit.damage >= 0, `${id} should have damage defined`);
    assert.ok(unit.cost > 0 || id === 'recruit', `${id} should have a supply cost`);
  }
});

test('knight stats follow the GDD', () => {
  const knightDef = GDD_UNIT_DEFS.knight;
  const knight = buildGddUnit('knight');
  assert.strictEqual(knight.hp, 2);
  assert.strictEqual(knight.damage, 3);
  assert.strictEqual(knight.defense, 2);
  assert.strictEqual(knight.shield, knightDef.shield ? knightDef.shield : undefined);
  assert.strictEqual(knight.cost, knightDef.supplyCost);
});

test('supply, credit, and revive costs match the document', () => {
  const recruit = buildGddUnit('recruit');
  const zombie = buildGddUnit('zombie');
  const giant = buildGddUnit('giant');

  assert.strictEqual(recruit.cost, 1);
  assert.strictEqual(recruit.creditCost, 0);
  assert.strictEqual(recruit.reviveCost, 0);

  assert.strictEqual(zombie.cost, 3);
  assert.strictEqual(zombie.creditCost, 50);
  assert.strictEqual(zombie.reviveCost, 12);

  assert.strictEqual(giant.cost, 5);
  assert.strictEqual(giant.creditCost, 100);
  assert.strictEqual(giant.reviveCost, 25);
});
