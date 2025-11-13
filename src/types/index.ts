// Unit types for the game
export interface Unit {
  id: string;
  name: string;
  type: 'warrior' | 'archer' | 'mage' | 'tank';
  attack: number;
  defense: number;
  health: number;
  speed: number;
  range: number;
  cost: number;
  icon: string;
}

// Position on the game board
export interface Position {
  row: number;
  col: number;
}

// Placed unit on the board
export interface PlacedUnit extends Unit {
  position: Position;
  team: 'player' | 'enemy';
}

// Strategy rule interface (placeholder for future use)
export interface StrategyRule {
  id: string;
  name: string;
  condition: string;
  action: string;
}

// Army composition
export interface Army {
  name: string;
  units: Unit[];
  totalCost: number;
}
