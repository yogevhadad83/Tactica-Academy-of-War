import type { PlacedUnit } from '../types';
import type { ArmyConfig } from '../hooks/useGameServer';

export function placementToArmyConfig(placedUnits: PlacedUnit[]): ArmyConfig {
  return placedUnits.map((unit) => ({ ...unit, position: { ...unit.position } }));
}
