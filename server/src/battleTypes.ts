// Local copy of the engine-facing types so the server can compile in isolation.
// Keep in sync with src/types and src/engine/battleEngine.

export type Team = 'player' | 'enemy';

export interface Unit {
  id: string;
  name: string;
  icon: string;
  cost: number;
  hp: number;
  damage: number;
  defense: number;
  speed: number;
  range: number;
  behaviorOptions: string[];
  upgradeOptions: string[];
}

export interface Position {
  row: number;
  col: number;
}

export interface ArmyUnitInstance extends Unit {
  instanceId: string;
}

export interface PlacedUnit extends ArmyUnitInstance {
  position: Position;
  team: Team;
  currentHp?: number;
}

export interface HitEvent {
  id: string;
  attackerId: string;
  attackerTeam: Team;
  attackerPosition: Position;
  targetId?: string;
  targetPosition: Position;
  attackType: 'melee' | 'ranged';
  didKill: boolean;
}

export interface BattleTickResult {
  units: PlacedUnit[];
  hits: string[];
  hitEvents: HitEvent[];
  moves: string[];
  winner: Team | null;
  currentTeam: Team;
  turnNumber: number;
}

export interface BattleState {
  units: PlacedUnit[];
  currentTeam: Team;
  turnNumber: number;
}

export interface BattleEngineModule {
  advanceBattleTick: (units: PlacedUnit[], currentTeam: Team, turnNumber: number) => BattleTickResult;
  initializeBattle: (units: PlacedUnit[]) => BattleState;
  BOARD_SIZE: number;
  BOARD_COLS: number;
  PLAYER_ROWS: number;
}
