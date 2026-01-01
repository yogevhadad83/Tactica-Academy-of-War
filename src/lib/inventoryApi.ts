import { supabase } from './supabaseClient';
import { toDbUnitTypeId } from '../utils/unitTypeIds';

export type PlayerUnitRow = {
  id: string;
  player_id: string;
  unit_type_id: string;
  state: 'alive' | 'dead';
  base_behavior_config: unknown;
};

export type PlayerArmyUnitPlacementRow = {
  id: string;
  player_army_id: string;
  row: number;
  col: number;
  unit_type_id: string | null;
  player_unit_id: string | null;
  behavior_config: unknown;
};

export const fetchInventory = async (playerId: string): Promise<PlayerUnitRow[]> => {
  const { data, error } = await supabase
    .from('player_units')
    .select('id, player_id, unit_type_id, state, base_behavior_config')
    .eq('player_id', playerId)
    .eq('state', 'alive')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as PlayerUnitRow[];
};

export const fetchPlacements = async (playerArmyId: string): Promise<PlayerArmyUnitPlacementRow[]> => {
  const { data, error } = await supabase
    .from('player_army_units')
    .select('id, player_army_id, row, col, unit_type_id, player_unit_id, behavior_config')
    .eq('player_army_id', playerArmyId);

  if (error) throw error;
  return (data ?? []) as PlayerArmyUnitPlacementRow[];
};

export const buyUnits = async (playerId: string, unitTypeId: string, count: number): Promise<void> => {
  if (count <= 0) return;
  const payload = Array.from({ length: count }, () => ({
    player_id: playerId,
    unit_type_id: toDbUnitTypeId(unitTypeId),
    state: 'alive' as const,
    base_behavior_config: {}
  }));

  const { error } = await supabase.from('player_units').insert(payload);
  if (error) throw error;
};

export const placeUnit = async (args: {
  playerArmyId: string;
  playerUnitId: string;
  row: number;
  col: number;
  behaviorConfig?: unknown;
  unitTypeId?: string;
}): Promise<void> => {
  const { playerArmyId, playerUnitId, row, col, behaviorConfig, unitTypeId } = args;

  const payload: Record<string, unknown> = {
    player_army_id: playerArmyId,
    row,
    col,
    player_unit_id: playerUnitId,
    behavior_config: behaviorConfig ?? null
  };

  if (unitTypeId) {
    payload.unit_type_id = toDbUnitTypeId(unitTypeId);
  }

  const { error } = await supabase.from('player_army_units').insert(payload);
  if (error) throw error;
};

export const movePlacedUnit = async (args: {
  playerArmyId: string;
  playerUnitId: string;
  row: number;
  col: number;
}): Promise<void> => {
  const { error } = await supabase
    .from('player_army_units')
    .update({ row: args.row, col: args.col })
    .eq('player_army_id', args.playerArmyId)
    .eq('player_unit_id', args.playerUnitId);

  if (error) throw error;
};

export const upsertPlacementBehavior = async (args: {
  playerArmyId: string;
  playerUnitId: string;
  behaviorConfig: unknown;
}): Promise<void> => {
  const { error } = await supabase
    .from('player_army_units')
    .update({ behavior_config: args.behaviorConfig })
    .eq('player_army_id', args.playerArmyId)
    .eq('player_unit_id', args.playerUnitId);

  if (error) throw error;
};

export const unplaceByPlayerUnitId = async (playerArmyId: string, playerUnitId: string): Promise<void> => {
  const { error } = await supabase
    .from('player_army_units')
    .delete()
    .eq('player_army_id', playerArmyId)
    .eq('player_unit_id', playerUnitId);

  if (error) throw error;
};
