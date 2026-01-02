import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattleTickResult } from '../engine/battleEngine';
import { getMatchTimeline, type MatchTimelinePayload } from '../lib/pvp';
import type { WinnerSide } from '../types/supabase';

export interface MatchTimelineState {
  timelineA: BattleTickResult[] | null;
  timelineB: BattleTickResult[] | null;
  winnerSide: WinnerSide | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 650;

export function useMatchTimeline(matchId: string | undefined | null): MatchTimelineState {
  const [timelineA, setTimelineA] = useState<BattleTickResult[] | null>(null);
  const [timelineB, setTimelineB] = useState<BattleTickResult[] | null>(null);
  const [winnerSide, setWinnerSide] = useState<WinnerSide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const applyPayload = useCallback((payload: MatchTimelinePayload) => {
    setTimelineA(payload.timelineA as BattleTickResult[]);
    setTimelineB(payload.timelineB as BattleTickResult[]);
    setWinnerSide(payload.winnerSide ?? null);
  }, []);

  const fetchTimeline = useCallback(async () => {
    if (!matchId) return;
    cancelRef.current = false;
    setLoading(true);
    setError(null);
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (cancelRef.current) break;
      try {
        const payload = await getMatchTimeline(matchId);
        if (cancelRef.current) break;
        applyPayload(payload);
        setLoading(false);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Failed to load match timeline.';
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    if (!cancelRef.current) {
      setError(lastError ?? 'Match timeline not available yet.');
      setLoading(false);
    }
  }, [applyPayload, matchId]);

  useEffect(() => {
    fetchTimeline();
    return () => {
      cancelRef.current = true;
    };
  }, [fetchTimeline]);

  return {
    timelineA,
    timelineB,
    winnerSide,
    loading,
    error,
    refresh: fetchTimeline,
  };
}
