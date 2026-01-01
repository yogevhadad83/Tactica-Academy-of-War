import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { acceptChallengeAndCreateMatch } from '../lib/pvp';
import './PvpLobby.css';

interface Challenge {
  id: string;
  challenger_id: string;
  defender_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  match_id: string | null;
  created_at: string;
  challenger_name?: string;
  defender_name?: string;
}

interface PlayerProfile {
  id: string;
  display_name: string;
  current_credits: number;
  created_at: string;
}

const sanitizeProfile = (profile: Partial<PlayerProfile>): PlayerProfile => ({
  id: profile.id || '',
  display_name: profile.display_name || 'Unknown Player',
  current_credits: profile.current_credits ?? 0,
  created_at: profile.created_at || new Date().toISOString()
});

const PvpLobby = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [opponents, setOpponents] = useState<PlayerProfile[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingOpponents, setLoadingOpponents] = useState(true);
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [creatingChallenge, setCreatingChallenge] = useState<string | null>(null);
  const [actioningChallenge, setActioningChallenge] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  const userId = user?.id;
  const navigatedChallengesRef = useRef<Set<string>>(new Set());
  const matchNavLocksRef = useRef<Set<string>>(new Set());

  const enterMatch = useCallback(
    (matchId: string, challengeId: string) => {
      if (!matchId) return;
      matchNavLocksRef.current.add(matchId);
      navigatedChallengesRef.current.add(challengeId);
      navigate(`/pvp/match/${matchId}`);
    },
    [navigate]
  );

  // Fetch opponents list - fallback to players table if player_profiles view doesn't exist
  const loadOpponents = useCallback(async () => {
    if (!userId) return;
    
    setLoadingOpponents(true);
    setDbError(null);
    try {
      // First try the player_profiles view
      let { data, error } = await supabase
        .from('player_profiles')
        .select('id, display_name, current_credits, created_at')
        .neq('id', userId);
      
      // If view doesn't exist, fallback to players table
      if (error && error.code === '42P01') {
        console.warn('player_profiles view not found, falling back to players table');
        const fallback = await supabase
          .from('players')
          .select('id, display_name, current_credits')
          .neq('id', userId);
        // Map fallback data to include created_at
        data = (fallback.data || []).map((p: { id: string; display_name: string; current_credits: number }) => ({
          ...p,
          created_at: new Date().toISOString()
        })) as typeof data;
        error = fallback.error;
      }
      
      if (error) {
        console.error('Failed to load opponents:', error);
        setDbError(`Database error: ${error.message}. Have you run the migration?`);
        setToastMessage('Failed to load opponents');
      } else {
        const sanitized = (data || []).map((profile) => sanitizeProfile(profile as Partial<PlayerProfile>));
        setOpponents(sanitized);
      }
    } finally {
      setLoadingOpponents(false);
    }
  }, [userId]);

  // Fetch challenges
  const loadChallenges = useCallback(async () => {
    if (!userId) return;
    
    setLoadingChallenges(true);
    try {
      const { data, error } = await supabase
        .from('pvp_challenges')
        .select('*')
        .or(`challenger_id.eq.${userId},defender_id.eq.${userId}`);
      
      if (error) {
        // If table doesn't exist, just show empty challenges (not an error for user)
        if (error.code === '42P01') {
          console.warn('pvp_challenges table not found - migration may not be applied');
          setChallenges([]);
        } else {
          console.error('Failed to load challenges:', error);
          setToastMessage('Failed to load challenges');
        }
      } else {
        setChallenges((data || []) as Challenge[]);
      }
    } finally {
      setLoadingChallenges(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadOpponents();
    loadChallenges();
  }, [userId, loadOpponents, loadChallenges]);

  const handleRealtimeChallengeChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Challenge>) => {
      if (!userId) return;

      const newChallenge = (payload.new as Challenge) ?? null;
      const oldChallenge = (payload.old as Challenge) ?? null;

      const involvesUser = [newChallenge, oldChallenge].some((record) =>
        record ? record.challenger_id === userId || record.defender_id === userId : false
      );

      if (!involvesUser) return;

      if (newChallenge) {
        setChallenges((prev) => {
          const idx = prev.findIndex((c) => c.id === newChallenge.id);
          if (idx === -1) {
            return [...prev, newChallenge];
          }
          const next = [...prev];
          next[idx] = newChallenge;
          return next;
        });

        if (
          newChallenge.status === 'accepted' &&
          newChallenge.match_id &&
          newChallenge.challenger_id === userId &&
          !navigatedChallengesRef.current.has(newChallenge.id) &&
          !matchNavLocksRef.current.has(newChallenge.match_id)
        ) {
          matchNavLocksRef.current.add(newChallenge.match_id);
          setToastMessage('Opponent accepted! Launching match…');
          enterMatch(newChallenge.match_id, newChallenge.id);
        }
        return;
      }

      if (oldChallenge) {
        setChallenges((prev) => prev.filter((c) => c.id !== oldChallenge.id));
      }
    },
    [enterMatch, userId]
  );

  // Subscribe to challenges where user is the DEFENDER (incoming challenges)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`pvp_challenges_defender_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pvp_challenges',
          filter: `defender_id=eq.${userId}`
        },
        handleRealtimeChallengeChange
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pvp_challenges',
          filter: `defender_id=eq.${userId}`
        },
        handleRealtimeChallengeChange
      )
      .subscribe((status) => {
        console.log('[Realtime] Defender challenges subscription:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, handleRealtimeChallengeChange]);

  // DEBUG SUBSCRIPTION: Log ALL pvp_challenges realtime events
  useEffect(() => {
    const DEBUG_REALTIME = true;
    if (!DEBUG_REALTIME || !userId) return;

    console.log('[DEBUG Realtime] Setting up ALL events subscription for pvp_challenges');

    const channel = supabase
      .channel('pvp_challenges_debug_all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pvp_challenges'
        },
        (payload) => {
          console.log('[DEBUG Realtime] pvp_challenges event received:', {
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
            currentUserId: userId
          });
        }
      )
      .subscribe((status) => {
        console.log('[DEBUG Realtime] pvp_challenges ALL events subscription status:', status);
      });

    return () => {
      console.log('[DEBUG Realtime] Cleaning up ALL events subscription');
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Subscribe to challenges where user is the CHALLENGER (to see acceptances/declines)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`pvp_challenges_challenger_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pvp_challenges',
          filter: `challenger_id=eq.${userId}`
        },
        handleRealtimeChallengeChange
      )
      .subscribe((status) => {
        console.log('[Realtime] Challenger challenges subscription:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, handleRealtimeChallengeChange]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`match_participants_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_participants',
          filter: `player_id=eq.${userId}`
        },
        (payload) => {
          const record = (payload.new as { match_id?: string } | null) ?? null;
          const matchId = record?.match_id;
          if (!matchId || matchNavLocksRef.current.has(matchId)) return;
          matchNavLocksRef.current.add(matchId);
          setToastMessage('Opponent accepted! Launching match…');
          navigate(`/pvp/match/${matchId}`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate, userId]);

  const filteredOpponents = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return opponents.filter((opp) => (opp.display_name || 'Unknown Player').toLowerCase().includes(term));
  }, [opponents, searchTerm]);

  const incomingChallenges = useMemo(() => {
    return challenges.filter(
      (c) => c.defender_id === userId && c.status === 'pending'
    );
  }, [challenges, userId]);

  const outgoingChallenges = useMemo(() => {
    return challenges.filter((c) => c.challenger_id === userId);
  }, [challenges, userId]);

  useEffect(() => {
    if (!userId) return;

    challenges.forEach((challenge) => {
      if (
        challenge.challenger_id === userId &&
        challenge.status === 'accepted' &&
        challenge.match_id &&
        !navigatedChallengesRef.current.has(challenge.id) &&
        !matchNavLocksRef.current.has(challenge.match_id)
      ) {
        matchNavLocksRef.current.add(challenge.match_id);
        setToastMessage('Challenge accepted! Launching match…');
        enterMatch(challenge.match_id, challenge.id);
      }
    });
  }, [challenges, userId, enterMatch, setToastMessage]);

  const handleChallenge = async (defenderId: string) => {
    if (!userId) return;

    setCreatingChallenge(defenderId);
    try {
      const { error } = await supabase.from('pvp_challenges').insert({
        challenger_id: userId,
        defender_id: defenderId,
        status: 'pending'
      });

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation
          setToastMessage('Challenge already pending to this player');
        } else {
          console.error('Failed to create challenge:', error);
          setToastMessage('Failed to send challenge');
        }
      } else {
        setToastMessage('Challenge sent!');
        loadChallenges();
      }
    } finally {
      setCreatingChallenge(null);
    }
  };

  const handleAccept = async (challengeId: string) => {
    if (!userId) return;
    
    setActioningChallenge(challengeId);
    try {
      const challenge = challenges.find((c) => c.id === challengeId);
      if (!challenge) {
        setToastMessage('Challenge not found');
        return;
      }

      // Use the pvp service to create match with full DB relationships
      const result = await acceptChallengeAndCreateMatch(
        challengeId,
        { challenger_id: challenge.challenger_id, defender_id: challenge.defender_id },
        {
          challengerId: challenge.challenger_id,
          defenderId: challenge.defender_id,
          currentUserId: userId
        }
      );

      if (!result.success) {
        if (result.supabaseError) {
          console.error('Accept challenge failed (Supabase):', result.supabaseError);
        } else if (result.debugError) {
          console.error('Accept challenge failed:', result.debugError);
        }
        setToastMessage(result.error || 'Failed to accept challenge');
        return;
      }

      setToastMessage('Challenge accepted! Preparing match...');
      loadChallenges(); // Refresh challenges list
      
      // Navigate to match view
      enterMatch(result.matchId, challengeId);
    } finally {
      setActioningChallenge(null);
    }
  };

  const handleDecline = async (challengeId: string) => {
    setActioningChallenge(challengeId);
    try {
      const { error } = await supabase
        .from('pvp_challenges')
        .update({ status: 'declined' })
        .eq('id', challengeId);

      if (error) {
        console.error('Failed to decline challenge:', error);
        setToastMessage('Failed to decline challenge');
      } else {
        setToastMessage('Challenge declined');
        loadChallenges();
      }
    } finally {
      setActioningChallenge(null);
    }
  };

  const handleCancel = async (challengeId: string) => {
    setActioningChallenge(challengeId);
    try {
      const { error } = await supabase
        .from('pvp_challenges')
        .update({ status: 'cancelled' })
        .eq('id', challengeId);

      if (error) {
        console.error('Failed to cancel challenge:', error);
        setToastMessage('Failed to cancel challenge');
      } else {
        setToastMessage('Challenge cancelled');
        loadChallenges();
      }
    } finally {
      setActioningChallenge(null);
    }
  };

  const getOpponentName = (id: string): string => {
    const opp = opponents.find((o) => o.id === id);
    return opp?.display_name || 'Unknown Player';
  };

  // Show loading state while auth is being checked
  if (authLoading) {
    return (
      <div className="pvp-lobby">
        <div className="pvp-container">
          <div className="pvp-section">
            <p className="pvp-loading">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <div className="pvp-lobby">
        <div className="pvp-container">
          <div className="pvp-section">
            <div className="pvp-section-header">
              <h2>PvP Arena</h2>
            </div>
            <div className="pvp-login-prompt">
              <p>You need to be logged in to challenge other players.</p>
              <button
                type="button"
                className="opponent-challenge-btn"
                onClick={() => navigate('/login')}
              >
                Log In
              </button>
              <button
                type="button"
                className="opponent-challenge-btn"
                style={{ marginLeft: '1rem', background: 'var(--surface-high, #2a3f5f)' }}
                onClick={() => navigate('/signup')}
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show database error if any
  if (dbError) {
    return (
      <div className="pvp-lobby">
        <div className="pvp-container">
          <div className="pvp-section">
            <div className="pvp-section-header">
              <h2>PvP Arena</h2>
            </div>
            <div className="pvp-error">
              <p>⚠️ {dbError}</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.7 }}>
                The PvP tables may not exist yet. Please run the database migration.
              </p>
              <button
                type="button"
                className="opponent-challenge-btn"
                onClick={() => {
                  setDbError(null);
                  loadOpponents();
                  loadChallenges();
                }}
                style={{ marginTop: '1rem' }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pvp-lobby">
      {toastMessage && (
        <div className="pvp-toast">
          {toastMessage}
          <button
            type="button"
            className="pvp-toast-close"
            onClick={() => setToastMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="pvp-container">
        {/* Left: Opponent List */}
        <div className="pvp-section opponents-section">
          <div className="pvp-section-header">
            <h2>Find Opponents</h2>
            <input
              type="text"
              placeholder="Search players…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pvp-search-input"
            />
          </div>

          <div className="opponents-list">
            {loadingOpponents ? (
              <p className="pvp-loading">Loading opponents…</p>
            ) : filteredOpponents.length === 0 ? (
              <p className="pvp-empty">
                {opponents.length === 0
                  ? 'No opponents available yet'
                  : 'No matching opponents'}
              </p>
            ) : (
              filteredOpponents.map((opp) => (
                <div key={opp.id} className="opponent-card">
                  <div className="opponent-info">
                    <h3 className="opponent-name">{opp.display_name}</h3>
                    <p className="opponent-credits">💰 {opp.current_credits}</p>
                  </div>
                  <button
                    type="button"
                    className="opponent-challenge-btn"
                    onClick={() => handleChallenge(opp.id)}
                    disabled={creatingChallenge === opp.id}
                  >
                    {creatingChallenge === opp.id ? 'Sending…' : 'Challenge'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Challenges Panel */}
        <div className="pvp-section challenges-section">
          <div className="pvp-section-header">
            <h2>Challenges</h2>
          </div>

          {/* Incoming Challenges */}
          <div className="challenges-subsection">
            <h3 className="challenges-subsection-title">Incoming</h3>
            {loadingChallenges ? (
              <p className="pvp-loading">Loading…</p>
            ) : incomingChallenges.length === 0 ? (
              <p className="pvp-empty">No incoming challenges</p>
            ) : (
              <div className="challenges-list">
                {incomingChallenges.map((challenge) => (
                  <div key={challenge.id} className="challenge-card incoming">
                    <div className="challenge-info">
                      <h4 className="challenge-player">
                        {getOpponentName(challenge.challenger_id)}
                      </h4>
                      <p className="challenge-time">
                        {new Date(challenge.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="challenge-actions">
                      <button
                        type="button"
                        className="challenge-btn accept"
                        onClick={() => handleAccept(challenge.id)}
                        disabled={actioningChallenge === challenge.id}
                      >
                        {actioningChallenge === challenge.id ? '…' : 'Accept'}
                      </button>
                      <button
                        type="button"
                        className="challenge-btn decline"
                        onClick={() => handleDecline(challenge.id)}
                        disabled={actioningChallenge === challenge.id}
                      >
                        {actioningChallenge === challenge.id ? '…' : 'Decline'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing Challenges */}
          <div className="challenges-subsection">
            <h3 className="challenges-subsection-title">Outgoing</h3>
            {loadingChallenges ? (
              <p className="pvp-loading">Loading…</p>
            ) : outgoingChallenges.length === 0 ? (
              <p className="pvp-empty">No outgoing challenges</p>
            ) : (
              <div className="challenges-list">
                {outgoingChallenges.map((challenge) => (
                  <div key={challenge.id} className="challenge-card outgoing">
                    <div className="challenge-info">
                      <h4 className="challenge-player">
                        {getOpponentName(challenge.defender_id)}
                      </h4>
                      <p className="challenge-status">
                        {challenge.status.toUpperCase()}
                      </p>
                    </div>
                    <div className="challenge-actions">
                      {challenge.status === 'accepted' && challenge.match_id ? (
                        <button
                          type="button"
                          className="challenge-btn accept"
                          onClick={() => {
                            setToastMessage('Entering match…');
                            enterMatch(challenge.match_id as string, challenge.id);
                          }}
                        >
                          Enter Match
                        </button>
                      ) : challenge.status === 'pending' ? (
                        <button
                          type="button"
                          className="challenge-btn cancel"
                          onClick={() => handleCancel(challenge.id)}
                          disabled={actioningChallenge === challenge.id}
                        >
                          {actioningChallenge === challenge.id ? '…' : 'Cancel'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PvpLobby;
