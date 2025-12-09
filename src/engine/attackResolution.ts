import type { PlacedUnit } from '../types';

export interface AttackResolutionInput {
  damage: number;
  targetHp: number;
  targetShield: number;
  targetDefense: number;
}

export interface AttackResolutionResult {
  newHp: number;
  newShield: number;
  damageToShield: number;
  damageToHp: number;
  overflow: number;
}

/**
 * Resolves a single attack against a defender using the deterministic Tactica rules.
 */
export const resolveAttack = ({
  damage,
  targetHp,
  targetShield,
  targetDefense
}: AttackResolutionInput): AttackResolutionResult => {
  const hasShield = targetShield > 0;

  if (hasShield) {
    const newShield = Math.max(targetShield - damage, 0);
    const overflow = Math.max(damage - targetShield, 0);
    const damageToHp = Math.max(overflow - targetDefense, 0);
    const newHp = Math.max(targetHp - damageToHp, 0);

    return {
      newHp,
      newShield,
      damageToShield: Math.min(damage, targetShield),
      damageToHp,
      overflow
    };
  }

  const raw = damage - targetDefense;
  const effective = Math.max(raw, 1); // minimum 1 HP damage per attack when no shield
  const newHp = Math.max(targetHp - effective, 0);

  return {
    newHp,
    newShield: 0,
    damageToShield: 0,
    damageToHp: effective,
    overflow: 0
  };
};

/**
 * Applies an attack to a live unit instance, mutating its HP and shield fields.
 */
export const applyAttackToUnit = (attacker: PlacedUnit, target: PlacedUnit): AttackResolutionResult => {
  const currentHp = target.currentHp ?? target.hp;
  const currentShield = target.currentShield ?? target.shield ?? 0;

  const result = resolveAttack({
    damage: attacker.damage,
    targetHp: currentHp,
    targetShield: currentShield,
    targetDefense: target.defense
  });

  target.currentHp = result.newHp;
  target.currentShield = result.newShield;

  return result;
};
