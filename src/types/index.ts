// Core Tactica unit definition
export interface Unit {
  id: string;
  name: string;
  icon: string;
  cost: number;
  hp: number;
  damage: number;
  defense: number;
  shield?: number;
  creditCost?: number;
  supplyCost?: number;
  reviveCost?: number;
  speed: number; // ticks per action
  range: number;
  description?: string;
  behaviorOptions: string[];
  upgradeOptions: string[];
}

// Individual unit instance tracked in the UI (e.g. Army Builder selections)
export interface ArmyUnitInstance extends Unit {
  instanceId: string;
}

// Position on the game board
export interface Position {
  row: number;
  col: number;
}

// Placed unit on the board
export interface PlacedUnit extends ArmyUnitInstance {
  position: Position;
  team: 'player' | 'enemy';
  currentHp?: number;
  currentShield?: number;
}

// Strategy rule saved per unit type
export interface StrategyRule {
  id: string;
  unitId: string;
  condition: string;
  action: string;
}

// Army composition
export interface Army {
  name: string;
  units: Unit[];
  totalCost: number;
}

export interface StrategyBook {
  [unitId: string]: StrategyRule[];
}

export interface BoardPlacements {
  [instanceId: string]: Position;
}

// Player data from public.players table
export interface Player {
  id: string;
  display_name: string | null;
  current_credits: number;
}
