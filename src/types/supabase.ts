export type MatchStatus = 'PENDING' | 'PRE_BATTLE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type MatchSide = 'A' | 'B';

export type Database = {
  public: {
    Tables: {
      matches: {
        Row: {
          id: string;
          status: MatchStatus;
          rules_version: string | null;
          board_width: number;
          board_height: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          status?: MatchStatus;
          rules_version?: string | null;
          board_width?: number;
          board_height?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          status?: MatchStatus;
          rules_version?: string | null;
          board_width?: number;
          board_height?: number;
          created_at?: string;
        };
      };
      match_participants: {
        Row: {
          id: string;
          match_id: string;
          player_id: string;
          side: MatchSide;
          starting_rank_id: string | null;
          starting_credits: number | null;
          army_template_id: string | null;
          pre_battle_adjustments: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          match_id: string;
          player_id: string;
          side: MatchSide;
          starting_rank_id?: string | null;
          starting_credits?: number | null;
          army_template_id?: string | null;
          pre_battle_adjustments?: Record<string, unknown> | null;
        };
        Update: {
          id?: string;
          match_id?: string;
          player_id?: string;
          side?: MatchSide;
          starting_rank_id?: string | null;
          starting_credits?: number | null;
          army_template_id?: string | null;
          pre_battle_adjustments?: Record<string, unknown> | null;
        };
      };
      match_units: {
        Row: {
          id: string;
          match_id: string;
          participant_id: string;
          unit_type_id: string;
          initial_row: number;
          initial_col: number;
          initial_behavior_config: Record<string, unknown> | null;
          hp: number;
          shield: number;
          defense: number;
          damage: number;
          is_alive: boolean;
        };
        Insert: {
          id?: string;
          match_id: string;
          participant_id: string;
          unit_type_id: string;
          initial_row: number;
          initial_col: number;
          initial_behavior_config?: Record<string, unknown> | null;
          hp: number;
          shield: number;
          defense: number;
          damage: number;
          is_alive?: boolean;
        };
        Update: {
          id?: string;
          match_id?: string;
          participant_id?: string;
          unit_type_id?: string;
          initial_row?: number;
          initial_col?: number;
          initial_behavior_config?: Record<string, unknown> | null;
          hp?: number;
          shield?: number;
          defense?: number;
          damage?: number;
          is_alive?: boolean;
        };
      };
    };
    Enums: {
      match_status: MatchStatus;
      match_side: MatchSide;
    };
  };
};
