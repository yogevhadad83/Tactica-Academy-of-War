import type { PlacedUnit, BattleTickResult } from './battleTypes';

export type ArmyConfig = PlacedUnit[];
export type { BattleTickResult };

export type ClientToServer =
  | { type: 'hello'; name: string }
  | { type: 'set_army'; army: ArmyConfig }
  | { type: 'challenge'; opponentName: string }
  | { type: 'challenge_response'; challengerName: string; accepted: boolean }
  | { type: 'demo_battle'; army: ArmyConfig };

export type ServerToClient =
  | { type: 'hello_ack'; userId: string }
  | { type: 'presence'; users: string[] }
  | { type: 'error'; message: string }
  | { type: 'challenge_received'; from: string }
  | { type: 'challenge_result'; success: boolean; message?: string }
  | {
      type: 'battle_start';
      matchId: string;
      youAre: 'A' | 'B';
      opponentName: string;
    }
  | {
      type: 'battle_result';
      matchId: string;
      winner: 'A' | 'B' | 'draw';
      timeline?: BattleTickResult[];
    };
