import { supabase } from '../lib/supabaseClient';
import { GDD_UNIT_DEFS, type GddUnitId } from '../../shared/gddUnits';

type UnitCostLike = { unitTypeId: string };

export type RewardableBattleResult = {
  matchId: string;
  winner: 'A' | 'B' | 'draw';
  battleType?: 'demo' | 'pvp';
  role?: 'A' | 'B' | null;
};

const WIN_REWARD_SAME_RANK = 50;
const WIN_REWARD_HIGHER_RANK = 100;
const WIN_REWARD_LOWER_RANK = 25;

const isGddUnitId = (unitTypeId: string): unitTypeId is GddUnitId =>
  Boolean((GDD_UNIT_DEFS as Record<string, unknown>)[unitTypeId]);

export const getUnitCost = (unitTypeId: string): number => {
  if (!unitTypeId) {
    console.warn('getUnitCost: missing unitTypeId');
    return 0;
  }
  
  // Try exact match first
  if (isGddUnitId(unitTypeId)) {
    return GDD_UNIT_DEFS[unitTypeId].creditCost;
  }
  
  // Try lowercase match (in case DB stores capitalized)
  const lowerCaseId = unitTypeId.toLowerCase();
  if (isGddUnitId(lowerCaseId as GddUnitId)) {
    return GDD_UNIT_DEFS[lowerCaseId as GddUnitId].creditCost;
  }
  
  console.warn(`getUnitCost: unknown unitTypeId "${unitTypeId}"`);
  return 0;
};

export const calculateArmyCost = (units: UnitCostLike[]): number => {
  return units.reduce((total, unit) => total + getUnitCost(unit.unitTypeId), 0);
};

type RewardContext = {
  playerRank?: number | null;
  opponentRank?: number | null;
};

export const calculateWinReward = ({ playerRank, opponentRank }: RewardContext = {}): number => {
  if (playerRank != null && opponentRank != null) {
    if (opponentRank > playerRank) return WIN_REWARD_HIGHER_RANK;
    if (opponentRank < playerRank) return WIN_REWARD_LOWER_RANK;
  }
  return WIN_REWARD_SAME_RANK;
};

export const applyBattleRewards = async (
  playerId: string,
  battleResult: RewardableBattleResult,
  options: RewardContext = {}
): Promise<{ applied: boolean; reward?: number; nextCredits?: number }> => {
  if (!playerId) return { applied: false };
  const battleType = battleResult.battleType ?? 'pvp';
  if (battleType !== 'pvp') return { applied: false };
  const role = battleResult.role ?? null;
  const didWin = role ? battleResult.winner === role : false;
  if (!didWin) return { applied: false };
  if (battleResult.winner === 'draw') return { applied: false };

  const reward = calculateWinReward({
    playerRank: options.playerRank,
    opponentRank: options.opponentRank,
  });

  const { data, error } = await supabase
    .from('players')
    .select('current_credits')
    .eq('id', playerId)
    .single();

  if (error) {
    throw error;
  }

  const currentCredits = data?.current_credits ?? 0;
  const nextCredits = currentCredits + reward;

  const { error: updateError } = await supabase
    .from('players')
    .update({ current_credits: nextCredits })
    .eq('id', playerId);

  if (updateError) {
    throw updateError;
  }

  return { applied: true, reward, nextCredits };
};
