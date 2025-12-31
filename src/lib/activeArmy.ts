import { supabase } from './supabaseClient';

export type ActiveArmy = { id: string; updated_at?: string | null };

export const ensureActiveArmy = async (playerId: string): Promise<ActiveArmy> => {
  const { data: favoriteArmy, error: favoriteError } = await supabase
    .from('player_armies')
    .select('id, updated_at')
    .eq('player_id', playerId)
    .eq('is_favorite', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (favoriteError) {
    throw favoriteError;
  }

  if (favoriteArmy) {
    return favoriteArmy;
  }

  const { error: unsetError } = await supabase
    .from('player_armies')
    .update({ is_favorite: false })
    .eq('player_id', playerId);

  if (unsetError) {
    throw unsetError;
  }

  const { data: createdArmy, error: createError } = await supabase
    .from('player_armies')
    .insert({
      player_id: playerId,
      name: 'Active Battle Plan',
      is_favorite: true
    })
    .select('id, updated_at')
    .single();

  if (createError || !createdArmy) {
    throw createError ?? new Error('Could not create active army');
  }

  return createdArmy;
};
