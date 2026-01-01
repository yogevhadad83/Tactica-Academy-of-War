import type { PlacedUnit, BattleTickResult } from './battleTypes';

export type ArmyConfig = PlacedUnit[];
export type { BattleTickResult };

export type PreviewChangeType = 'move' | 'swap' | 'replace' | 'edit_behavior';

export interface PreviewChange {
  type: PreviewChangeType;
  unitInstanceId?: string; // For move, swap, replace, edit_behavior
  targetInstanceId?: string; // For swap
  newPosition?: { row: number; col: number }; // For move
  newPlayerUnitId?: string; // For replace
  newBehaviors?: string[]; // For edit_behavior
}

export type ClientToServer =
  | { type: 'hello'; name: string }
  | { type: 'set_army'; army: ArmyConfig }
  | { type: 'challenge'; opponentName: string }
  | { type: 'challenge_response'; challengerName: string; accepted: boolean }
  | { type: 'demo_battle'; army: ArmyConfig }
  | {
      type: 'preview_change';
      matchId: string;
      change: PreviewChange;
    };

export type ServerToClient =
  | { type: 'hello_ack'; userId: string }
  | { type: 'presence'; users: string[] }
  | { type: 'error'; message: string }
  | { type: 'challenge_received'; from: string }
  | { type: 'challenge_result'; success: boolean; message?: string }
  | {
      type: 'preview_start';
      matchId: string;
      youAre: 'A' | 'B';
      opponentName: string;
      yourBoard: ArmyConfig;
      opponentBoard: ArmyConfig;
      turn: 'A' | 'B';
    }
  | {
      type: 'preview_update';
      matchId: string;
      turn: 'A' | 'B';
      updatedBoard: ArmyConfig;
      side: 'yours' | 'opponent';
    }
  | {
      type: 'preview_committed';
      matchId: string;
      side: 'yours' | 'opponent';
    }
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
      battleType?: 'demo' | 'pvp';
      timeline?: BattleTickResult[];
    };
