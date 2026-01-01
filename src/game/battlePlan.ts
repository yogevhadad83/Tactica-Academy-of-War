import type { PlacedUnit } from '../types';

/**
 * BattlePlan represents a player's complete tactical configuration
 * for PvP matchmaking. It includes unit placements and their tactical behaviors.
 */
export interface BattlePlan {
  /** Schema version for migration support */
  version: number;
  
  /** ISO timestamp of last update */
  updatedAt: string;
  
  /** Unit placements on the player's side of the board */
  placements: PlacedUnit[];
  
  /** Unit-specific behavior configurations keyed by instanceId */
  unitBehaviors?: Record<string, string[]>;
  
  /** Total supply cost of the current plan */
  supplyUsed?: number;
}

/**
 * Creates an empty battle plan
 */
export const createEmptyBattlePlan = (): BattlePlan => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  placements: [],
  unitBehaviors: {},
  supplyUsed: 0
});
