import type { PostgrestError, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { API_BASE_URL } from '../config/api';
import type { Database, WinnerSide } from '../types/supabase';
import { supabase } from './supabaseClient';

type PlayerRow = {
  id: string;
  display_name: string | null;
  current_rank_id: string | null;
  current_credits: number | null;
  rules_version: string | null;
};

type PlayerArmyRow = {
  id: string;
};

type PlayerArmyUnitRow = {
  unit_type_id: string;
  row: number;
  col: number;
  behavior_config: Record<string, unknown> | null;
};

type UnitTypeStatRow = {
  unit_type_id: string;
  hp: number;
  shield: number;
  defense: number;
  damage: number;
};

type MatchInsert = Database['public']['Tables']['matches']['Insert'];
type MatchSide = Database['public']['Enums']['match_side'];
type MatchRow = Database['public']['Tables']['matches']['Row'];
type RawParticipantRow = Database['public']['Tables']['match_participants']['Row'];
type MatchUnitRow = Database['public']['Tables']['match_units']['Row'];

export type MatchTimelinePayload = {
  matchId: string;
  winnerSide: WinnerSide | null;
  timelineA: unknown[];
  timelineB: unknown[];
};

const SIDE_CHALLENGER: MatchSide = 'A';
const SIDE_DEFENDER: MatchSide = 'B';

type Coordinates = { row: number; col: number };

export type PreBattleMove = {
  kind: 'MOVE';
  from: Coordinates;
  to: Coordinates;
  submittedAt: string;
} | {
  kind: 'SKIP';
  submittedAt: string;
};

type ParticipantRow = Omit<RawParticipantRow, 'pre_battle_adjustments'> & {
  pre_battle_adjustments: PreBattleMove | null;
};

export type MatchParticipantWithMeta = ParticipantRow & {
  display_name: string | null;
};

export interface MatchBundle {
  match: MatchRow;
  participants: MatchParticipantWithMeta[];
  units: MatchUnitRow[];
}

interface CreateMatchParams {
  challengerId: string;
  defenderId: string;
  currentUserId: string;
}

export type CreateMatchResult =
  | { success: true; matchId: string }
  | { success: false; error: string; supabaseError?: PostgrestError | null; debugError?: unknown };

const formatSupabaseError = (error?: PostgrestError | null) => {
  if (!error) return 'Unknown Supabase error';
  return `${error.code ?? 'ERR'}: ${error.message}`;
};

const missingPlayersMessage = (missingIds: string[]) =>
  `Missing players for IDs: ${missingIds.join(', ')}`;

async function fetchPlayersByIds(
  challengerId: string,
  defenderId: string
): Promise<{ playersById?: Map<string, PlayerRow>; error?: string; supabaseError?: PostgrestError | null }> {
  const ids = [challengerId, defenderId];
  const { data, error } = await supabase
    .from('players')
    .select('id, display_name, current_rank_id, current_credits, rules_version')
    .in('id', ids);

  if (error) {
    return { error: formatSupabaseError(error), supabaseError: error };
  }

  const playersById = new Map<string, PlayerRow>();
  (data ?? []).forEach((player) => {
    playersById.set(player.id, player as PlayerRow);
  });

  const missing = ids.filter((id) => !playersById.has(id));
  if (missing.length) {
    return { playersById, error: missingPlayersMessage(missing) };
  }

  return { playersById };
}

async function fetchActiveArmyId(playerId: string): Promise<{ armyId?: string; error?: string; supabaseError?: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('player_armies')
    .select('id')
    .eq('player_id', playerId)
    .order('is_favorite', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { error: formatSupabaseError(error), supabaseError: error };
  }

  if (!data) {
    return { error: `No army found for player ${playerId}` };
  }

  return { armyId: (data as PlayerArmyRow).id };
}

async function fetchArmyUnits(armyId: string): Promise<{ units?: PlayerArmyUnitRow[]; error?: string; supabaseError?: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('player_army_units')
    .select('unit_type_id, row, col, behavior_config')
    .eq('player_army_id', armyId);

  if (error) {
    return { error: formatSupabaseError(error), supabaseError: error };
  }

  return { units: (data || []) as PlayerArmyUnitRow[] };
}

async function fetchUnitStats(rulesVersion: string, unitTypeIds: string[]): Promise<{ stats?: Map<string, UnitTypeStatRow>; error?: string; supabaseError?: PostgrestError | null }> {
  if (unitTypeIds.length === 0) {
    return { stats: new Map() };
  }

  const { data, error } = await supabase
    .from('unit_type_stats')
    .select('unit_type_id, hp, shield, defense, damage')
    .eq('rules_version', rulesVersion)
    .in('unit_type_id', unitTypeIds);

  if (error) {
    return { error: formatSupabaseError(error), supabaseError: error };
  }

  const stats = new Map<string, UnitTypeStatRow>();
  (data ?? []).forEach((row) => stats.set(row.unit_type_id, row as UnitTypeStatRow));

  return { stats };
}

async function createMatchRecord(rulesVersion: string): Promise<{ matchId?: string; error?: string; supabaseError?: PostgrestError | null }> {
  const newMatch: MatchInsert = {
    rules_version: rulesVersion,
    board_width: 6,
    board_height: 12
  };

  const { data, error } = await supabase
    .from('matches')
    .insert(newMatch)
    .select('id')
    .maybeSingle();

  if (error) {
    return { error: formatSupabaseError(error), supabaseError: error };
  }

  if (!data) {
    return { error: 'Match creation did not return an id (check RLS policies)' };
  }

  return { matchId: (data as { id: string }).id };
}

async function createParticipants(params: {
  matchId: string;
  challenger: PlayerRow;
  defender: PlayerRow;
  challengerArmyId: string;
  defenderArmyId: string;
}): Promise<{
  challengerParticipantId?: string;
  defenderParticipantId?: string;
  error?: string;
  supabaseError?: PostgrestError | null;
}> {
  const { matchId, challenger, defender, challengerArmyId, defenderArmyId } = params;

  const { data, error } = await supabase
    .from('match_participants')
    .insert([
      {
        match_id: matchId,
        player_id: challenger.id,
        side: SIDE_CHALLENGER,
        starting_rank_id: challenger.current_rank_id,
        starting_credits: challenger.current_credits,
        army_template_id: challengerArmyId
      },
      {
        match_id: matchId,
        player_id: defender.id,
        side: SIDE_DEFENDER,
        starting_rank_id: defender.current_rank_id,
        starting_credits: defender.current_credits,
        army_template_id: defenderArmyId
      }
    ])
    .select('id, player_id, side');

  if (error) {
    return { error: formatSupabaseError(error), supabaseError: error };
  }

  const participants = data || [];
  const challengerParticipant = participants.find((p) => p.player_id === challenger.id);
  const defenderParticipant = participants.find((p) => p.player_id === defender.id);

  if (!challengerParticipant || !defenderParticipant) {
    return { error: 'Participants were not returned for both players' };
  }

  return {
    challengerParticipantId: challengerParticipant.id,
    defenderParticipantId: defenderParticipant.id
  };
}

async function insertMatchUnits(rows: Array<Record<string, unknown>>): Promise<{ error?: string; supabaseError?: PostgrestError | null }> {
  const { error } = await supabase.from('match_units').insert(rows);

  if (error) {
    return { error: formatSupabaseError(error), supabaseError: error };
  }

  return {};
}

async function updateChallengeStatus(challengeId: string, matchId: string) {
  return supabase
    .from('pvp_challenges')
    .update({ status: 'accepted', match_id: matchId })
    .eq('id', challengeId);
}

const parsePreBattleMove = (value: unknown): PreBattleMove | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const submittedAt = candidate.submittedAt;
  if (typeof submittedAt !== 'string') return null;

  if (candidate.kind === 'SKIP') {
    return { kind: 'SKIP', submittedAt };
  }

  if (candidate.kind !== 'MOVE') return null;

  const from = candidate.from as Coordinates | undefined;
  const to = candidate.to as Coordinates | undefined;
  if (
    !from ||
    !to ||
    typeof from.row !== 'number' ||
    typeof from.col !== 'number' ||
    typeof to.row !== 'number' ||
    typeof to.col !== 'number'
  ) {
    return null;
  }
  return {
    kind: 'MOVE',
    from: { row: from.row, col: from.col },
    to: { row: to.row, col: to.col },
    submittedAt,
  };
};

const mapParticipantRow = (row: RawParticipantRow): ParticipantRow => ({
  ...row,
  pre_battle_adjustments: parsePreBattleMove(row.pre_battle_adjustments)
});

/**
 * Accept a PvP challenge and create a complete match with all DB relationships.
 * 
 * Flow:
 * 1. Validate defender
 * 2. Get rules_version from players
 * 3. Select active army for each player (is_favorite desc, updated_at desc)
 * 4. Create match in public.matches
 * 5. Create match_participants for challenger + defender
 * 6. Copy units from player_army_units → match_units (with stats from unit_type_stats)
 * 7. Update challenge status
 */
export async function acceptChallengeAndCreateMatch(
  challengeId: string,
  _challenge: { challenger_id: string; defender_id: string },
  params: CreateMatchParams
): Promise<CreateMatchResult> {
  const { challengerId, defenderId, currentUserId } = params;

  // 1. Validate current user is the defender
  if (currentUserId !== defenderId) {
    return { success: false, error: 'You are not the defender of this challenge' };
  }

  try {
    const playersResult = await fetchPlayersByIds(challengerId, defenderId);
    if (!playersResult.playersById || playersResult.error) {
      return {
        success: false,
        error: playersResult.error ?? 'Failed to load player data',
        supabaseError: playersResult.supabaseError
      };
    }

    const playersById = playersResult.playersById;
    const challenger = playersById.get(challengerId);
    const defender = playersById.get(defenderId);

    if (!challenger || !defender) {
      return {
        success: false,
        error: missingPlayersMessage([
          ...(!challenger ? [challengerId] : []),
          ...(!defender ? [defenderId] : [])
        ])
      };
    }

    const rulesVersion = defender.rules_version || challenger.rules_version || 'v1.0.0';

    const challengerArmy = await fetchActiveArmyId(challengerId);
    if (!challengerArmy.armyId) {
      return { success: false, error: challengerArmy.error ?? 'Challenger army not found', supabaseError: challengerArmy.supabaseError };
    }

    const defenderArmy = await fetchActiveArmyId(defenderId);
    if (!defenderArmy.armyId) {
      return { success: false, error: defenderArmy.error ?? 'Defender army not found', supabaseError: defenderArmy.supabaseError };
    }

    const matchRecord = await createMatchRecord(rulesVersion);
    if (!matchRecord.matchId) {
      return { success: false, error: matchRecord.error ?? 'Failed to create match', supabaseError: matchRecord.supabaseError };
    }

    const matchId = matchRecord.matchId;

    const participantsResult = await createParticipants({
      matchId,
      challenger,
      defender,
      challengerArmyId: challengerArmy.armyId,
      defenderArmyId: defenderArmy.armyId
    });

    if (!participantsResult.challengerParticipantId || !participantsResult.defenderParticipantId) {
      await supabase.from('matches').delete().eq('id', matchId);
      return {
        success: false,
        error: participantsResult.error ?? 'Failed to create participants',
        supabaseError: participantsResult.supabaseError
      };
    }

    const challengerUnitsResult = await fetchArmyUnits(challengerArmy.armyId);
    if (!challengerUnitsResult.units) {
      await supabase.from('matches').delete().eq('id', matchId);
      return {
        success: false,
        error: challengerUnitsResult.error ?? 'Failed to load challenger units',
        supabaseError: challengerUnitsResult.supabaseError
      };
    }

    const defenderUnitsResult = await fetchArmyUnits(defenderArmy.armyId);
    if (!defenderUnitsResult.units) {
      await supabase.from('matches').delete().eq('id', matchId);
      return {
        success: false,
        error: defenderUnitsResult.error ?? 'Failed to load defender units',
        supabaseError: defenderUnitsResult.supabaseError
      };
    }

    const allUnitTypeIds = [
      ...challengerUnitsResult.units.map((u) => u.unit_type_id),
      ...defenderUnitsResult.units.map((u) => u.unit_type_id)
    ];
    const uniqueUnitTypeIds = [...new Set(allUnitTypeIds)];

    const statsResult = await fetchUnitStats(rulesVersion, uniqueUnitTypeIds);
    if (!statsResult.stats) {
      await supabase.from('matches').delete().eq('id', matchId);
      return {
        success: false,
        error: statsResult.error ?? 'Failed to load unit stats',
        supabaseError: statsResult.supabaseError
      };
    }

    const statsByUnitType = statsResult.stats;
    const matchUnitsToInsert: Array<Record<string, unknown>> = [];

    for (const unit of challengerUnitsResult.units) {
      const stats = statsByUnitType.get(unit.unit_type_id);
      if (!stats) {
        console.warn(`No stats found for unit_type_id ${unit.unit_type_id}, skipping`);
        continue;
      }
      matchUnitsToInsert.push({
        match_id: matchId,
        participant_id: participantsResult.challengerParticipantId,
        unit_type_id: unit.unit_type_id,
        initial_row: unit.row,
        initial_col: unit.col,
        initial_behavior_config: unit.behavior_config || {},
        hp: stats.hp,
        shield: stats.shield,
        defense: stats.defense,
        damage: stats.damage,
        is_alive: true
      });
    }

    for (const unit of defenderUnitsResult.units) {
      const stats = statsByUnitType.get(unit.unit_type_id);
      if (!stats) {
        console.warn(`No stats found for unit_type_id ${unit.unit_type_id}, skipping`);
        continue;
      }
      matchUnitsToInsert.push({
        match_id: matchId,
        participant_id: participantsResult.defenderParticipantId,
        unit_type_id: unit.unit_type_id,
        initial_row: unit.row,
        initial_col: unit.col,
        initial_behavior_config: unit.behavior_config || {},
        hp: stats.hp,
        shield: stats.shield,
        defense: stats.defense,
        damage: stats.damage,
        is_alive: true
      });
    }

    if (matchUnitsToInsert.length === 0) {
      await supabase.from('matches').delete().eq('id', matchId);
      return { success: false, error: 'No units found in either army' };
    }

    const unitsInsertResult = await insertMatchUnits(matchUnitsToInsert);
    if (unitsInsertResult.error) {
      await supabase.from('matches').delete().eq('id', matchId);
      return {
        success: false,
        error: unitsInsertResult.error,
        supabaseError: unitsInsertResult.supabaseError
      };
    }

    const { error: updateChallengeError } = await updateChallengeStatus(challengeId, matchId);
    if (updateChallengeError) {
      console.error('Failed to update challenge status:', updateChallengeError);
    }

    // Move the match into the pre-battle phase as soon as it is created.
    const { error: preBattleError } = await supabase
      .from('matches')
      .update({ status: 'PRE_BATTLE' })
      .eq('id', matchId)
      .eq('status', 'PENDING');
    if (preBattleError) {
      console.error('Failed to set match to PRE_BATTLE:', formatSupabaseError(preBattleError));
    }

    return { success: true, matchId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
      debugError: err
    };
  }
}

export async function fetchMatchBundle(matchId: string): Promise<MatchBundle> {
  const [{ data: matchRow, error: matchError }, { data: participants, error: participantsError }, { data: unitRows, error: unitsError }] = await Promise.all([
    supabase
      .from('matches')
      .select('id, status, rules_version, board_width, board_height, created_at')
      .eq('id', matchId)
      .maybeSingle(),
    supabase
      .from('match_participants')
      .select('id, match_id, player_id, side, starting_rank_id, starting_credits, army_template_id, pre_battle_adjustments')
      .eq('match_id', matchId),
    supabase
      .from('match_units')
      .select('id, match_id, participant_id, unit_type_id, initial_row, initial_col, initial_behavior_config, hp, shield, defense, damage, is_alive')
      .eq('match_id', matchId)
  ]);

  if (matchError || !matchRow) {
    throw new Error(matchError ? formatSupabaseError(matchError) : 'Match not found');
  }

  if (participantsError) {
    throw new Error(formatSupabaseError(participantsError));
  }

  if (unitsError) {
    throw new Error(formatSupabaseError(unitsError));
  }

  const participantRows = (participants ?? []).map(mapParticipantRow);
  const playerIds = participantRows.map((p) => p.player_id);

  let playerRows: Array<{ id: string; display_name: string | null }>; 
  let playersError: PostgrestError | null = null;

  if (playerIds.length) {
    const { data, error } = await supabase
      .from('players')
      .select('id, display_name')
      .in('id', playerIds);
    playerRows = data ?? [];
    playersError = error;
  } else {
    playerRows = [];
  }

  if (playersError) {
    throw new Error(formatSupabaseError(playersError));
  }

  const playerNameById = new Map<string, string | null>();
  playerRows.forEach((player) => {
    playerNameById.set(player.id, player.display_name ?? null);
  });

  const participantsWithMeta: MatchParticipantWithMeta[] = participantRows
    .map((row) => ({
      ...row,
      display_name: playerNameById.get(row.player_id) ?? 'Commander'
    }))
    .sort((a, b) => a.side.localeCompare(b.side));

  return {
    match: matchRow as MatchRow,
    participants: participantsWithMeta,
    units: (unitRows ?? []) as MatchUnitRow[]
  };
}

export async function submitPreBattleMove(participantId: string, move: PreBattleMove | null) {
  const payload = move
    ? {
        ...move,
        submittedAt: move.submittedAt ?? new Date().toISOString()
      } as PreBattleMove
    : null;

  const { data, error } = await supabase
    .from('match_participants')
    .update({ pre_battle_adjustments: payload })
    .eq('id', participantId)
    .is('pre_battle_adjustments', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if (!data) {
    throw new Error('A pre-battle move has already been submitted.');
  }

  return payload;
}

export async function runMatchOnServer(matchId: string): Promise<MatchTimelinePayload> {
  const url = `${API_BASE_URL}/api/pvp/matches/${matchId}/run`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST' });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to reach battle server.');
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch (err) {
    // Non-JSON error bodies fall through to generic error handling
  }

  if (!response.ok) {
    const message = (payload && typeof payload.error === 'string')
      ? payload.error
      : `Failed to start match ${matchId}`;
    throw new Error(message);
  }

  if (!payload || payload.timelineA === undefined || payload.timelineB === undefined) {
    throw new Error('Server did not return a match timeline.');
  }

  return {
    matchId: payload.matchId ?? matchId,
    winnerSide: (payload.winnerSide as WinnerSide | null) ?? null,
    timelineA: payload.timelineA as unknown[],
    timelineB: payload.timelineB as unknown[],
  };
}

export async function startMatch(matchId: string): Promise<MatchTimelinePayload> {
  return runMatchOnServer(matchId);
}

export async function getMatchTimeline(matchId: string): Promise<MatchTimelinePayload> {
  const { data, error } = await supabase
    .from('match_timelines')
    .select('timeline_a, timeline_b, winner_side')
    .eq('match_id', matchId)
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if (!data || data.timeline_a == null || data.timeline_b == null) {
    throw new Error('Match timeline is not available yet.');
  }

  return {
    matchId,
    winnerSide: (data.winner_side as WinnerSide | null) ?? null,
    timelineA: data.timeline_a as unknown[],
    timelineB: data.timeline_b as unknown[],
  };
}

export async function ensureMatchPreBattle(matchId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('matches')
    .update({ status: 'PRE_BATTLE' })
    .eq('id', matchId)
    .eq('status', 'PENDING')
    .select('status')
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return Boolean(data);
}

export async function completeMatch(matchId: string): Promise<void> {
  const [matchResult, challengeResult] = await Promise.all([
    supabase
      .from('matches')
      .update({ status: 'COMPLETED' })
      .eq('id', matchId)
      .in('status', ['IN_PROGRESS', 'PRE_BATTLE']),
    // Mark the originating challenge as resolved using an allowed status.
    supabase
      .from('pvp_challenges')
      .update({ status: 'expired' })
      .eq('match_id', matchId)
  ]);

  if (matchResult.error) {
    throw new Error(formatSupabaseError(matchResult.error));
  }

  if (challengeResult.error) {
    console.warn('Failed to update challenge status on match completion:', formatSupabaseError(challengeResult.error));
  }
}

export async function abortMatch(matchId: string): Promise<void> {
  const [unitsResult, participantsResult, challengeResult] = await Promise.all([
    supabase.from('match_units').delete().eq('match_id', matchId),
    supabase.from('match_participants').delete().eq('match_id', matchId),
    supabase.from('pvp_challenges').update({ status: 'cancelled', match_id: null }).eq('match_id', matchId)
  ]);

  const cleanupErrors: string[] = [];

  if (unitsResult.error) {
    cleanupErrors.push(formatSupabaseError(unitsResult.error));
  }

  if (participantsResult.error) {
    cleanupErrors.push(formatSupabaseError(participantsResult.error));
  }

  if (challengeResult.error && challengeResult.error.code !== '42P01') {
    cleanupErrors.push(formatSupabaseError(challengeResult.error));
  }

  if (cleanupErrors.length) {
    throw new Error(cleanupErrors.join(' | '));
  }

  const { error: matchStatusError } = await supabase.from('matches').update({ status: 'CANCELLED' }).eq('id', matchId);
  if (matchStatusError) {
    throw new Error(formatSupabaseError(matchStatusError));
  }
}

export function subscribeParticipants(matchId: string, onUpdate: (participant: ParticipantRow) => void) {
  const channel: RealtimeChannel = supabase.channel(`match_participants:${matchId}`);

  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'match_participants',
      filter: `match_id=eq.${matchId}`
    },
    (payload: RealtimePostgresChangesPayload<RawParticipantRow>) => {
      if (!payload.new || typeof payload.new === 'object' && !('id' in payload.new)) return;
      onUpdate(mapParticipantRow(payload.new as RawParticipantRow));
    }
  );

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
