import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import type { Player } from '../types';

export const usePlayer = () => {
  const { user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const toError = useCallback((err: unknown) => {
    if (err instanceof Error) return err;
    if (err && typeof err === 'object') {
      const maybeMessage =
        (err as { message?: string }).message ||
        (err as { details?: string }).details ||
        (err as { hint?: string }).hint;
      if (maybeMessage) {
        return new Error(maybeMessage);
      }
    }
    return new Error('Unknown error');
  }, []);

  const loadPlayer = useCallback(async () => {
    if (!user) {
      setPlayer(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('players')
        .select('id, display_name, current_credits')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      setPlayer(data as Player);
    } catch (err) {
      const formatted = toError(err);
      setError(formatted);
      console.error('Failed to load player data:', formatted.message);
    } finally {
      setLoading(false);
    }
  }, [user, toError]);

  useEffect(() => {
    loadPlayer();
  }, [loadPlayer, refreshIndex]);

  useEffect(() => {
    if (!user) return undefined;

    const channel = supabase
      .channel(`players-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `id=eq.${user.id}` },
        (payload) => {
          const next = payload.new as Player | null;
          if (next) {
            setPlayer(next);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const refresh = useCallback(() => {
    setRefreshIndex((index) => index + 1);
  }, []);

  const setPlayerCredits = useCallback((nextCredits: number) => {
    setPlayer((prev) => (prev ? { ...prev, current_credits: nextCredits } : prev));
  }, []);

  return { player, loading, error, refresh, setPlayerCredits };
};
