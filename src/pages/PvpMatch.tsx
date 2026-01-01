import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './PvpMatch.css';
import BoardSetupPanel from '../components/BoardSetupPanel';
import { useAuth } from '../context/AuthContext';
import { useUnitCatalog, type UnitCatalogEntry } from '../hooks/useUnitCatalog';
import { BOARD_COLS, BOARD_SIZE, PLAYER_ZONE_START } from '../engine/battleEngine';
import type { ArmyUnitInstance, PlacedUnit } from '../types';
import { runTrainingBattle } from '../engine/runTrainingBattle';
import { calculateTickDuration } from '../components/units/useUnitLayer';
import type { BattleTickResult } from '../engine/battleEngine';
import {
  abortMatch,
  completeMatch,
  fetchMatchBundle,
  ensureMatchPreBattle,
  startMatch,
  submitPreBattleMove,
  subscribeParticipants,
  type MatchBundle,
  type PreBattleMove
} from '../lib/pvp';
import { supabase } from '../lib/supabaseClient';
import type { MatchSide } from '../types/supabase';

const ThreeBattleStage = lazy(() => import('../components/ThreeBattleStage'));

// Playback constants mirror Training/BoardView.
const DEFAULT_TICK_MS = 2000;
const MIN_TICK_MS = 800;

type Coordinates = { row: number; col: number };
type MatchUnitRow = MatchBundle['units'][number];
type PositionedUnit = MatchUnitRow & Coordinates;

const formatUnitLabel = (id: string) =>
  id
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const formatTile = (row: number, col: number) => `R${row + 1}C${col + 1}`;

const applyMoveToUnits = (units: MatchUnitRow[], move: PreBattleMove | null): PositionedUnit[] => {
  if (!units.length) return [];
  return units.map((unit) => {
    if (move && move.kind === 'MOVE' && move.from.row === unit.initial_row && move.from.col === unit.initial_col) {
      return { ...unit, row: move.to.row, col: move.to.col };
    }
    return { ...unit, row: unit.initial_row, col: unit.initial_col };
  });
};

const summarizeMove = (move: PreBattleMove | null) => {
  if (!move) return 'Awaiting submission';
  if (move.kind === 'SKIP') return 'Skipped adjustments';
  return `${formatTile(move.from.row, move.from.col)} → ${formatTile(move.to.row, move.to.col)}`;
};

const clonePlacedUnits = (units: PlacedUnit[]): PlacedUnit[] =>
  units.map((unit) => ({
    ...unit,
    position: { ...unit.position },
    selectedBehaviors: unit.selectedBehaviors ? [...unit.selectedBehaviors] : undefined
  }));

const toActualPosition = (position: Coordinates, shift: number): Coordinates => ({
  row: position.row - shift,
  col: position.col
});

const buildArmyInstance = (unit: MatchUnitRow, catalog: Map<string, UnitCatalogEntry>): ArmyUnitInstance => {
  const key = unit.unit_type_id.toLowerCase();
  const meta = catalog.get(key);
  if (meta) {
    return { ...meta, instanceId: unit.id } as ArmyUnitInstance;
  }

  return {
    id: key,
    name: formatUnitLabel(unit.unit_type_id),
    icon: '⚔️',
    cost: 0,
    hp: unit.hp,
    damage: unit.damage,
    defense: unit.defense,
    shield: unit.shield,
    speed: 1,
    range: 1,
    behaviorOptions: [],
    upgradeOptions: [],
    creditCost: 0,
    reviveCost: 0,
    supplyCost: 0,
    instanceId: unit.id
  } as ArmyUnitInstance;
};

const buildPlacedUnits = (
  units: PositionedUnit[],
  team: 'player' | 'enemy',
  rowTransform: (row: number) => number,
  catalog: Map<string, UnitCatalogEntry>
): PlacedUnit[] =>
  units.map((unit) => {
    const armyInstance = buildArmyInstance(unit, catalog);
    return {
      ...armyInstance,
      position: { row: rowTransform(unit.row), col: unit.col },
      team,
      currentHp: unit.hp,
      currentShield: unit.shield,
      selectedBehaviors: undefined
    } as PlacedUnit;
  });

const calculateDifferenceCount = (candidate: PlacedUnit[], baseline: PlacedUnit[], shift: number) => {
  if (!baseline.length) return 0;
  const baselineMap = new Map(baseline.map((unit) => [unit.instanceId, unit]));
  let diffCount = 0;

  for (const unit of candidate) {
    const reference = baselineMap.get(unit.instanceId);
    if (!reference) continue;
    const baselinePos = toActualPosition(reference.position, shift);
    const candidatePos = toActualPosition(unit.position, shift);
    if (baselinePos.row !== candidatePos.row || baselinePos.col !== candidatePos.col) {
      diffCount += 1;
      if (diffCount > 1) break;
    }
  }

  return diffCount;
};

const PvpMatch = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bundle, setBundle] = useState<MatchBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { units: catalogUnits } = useUnitCatalog();
  const catalogById = useMemo(() => new Map(catalogUnits.map((unit) => [unit.id.toLowerCase(), unit])), [catalogUnits]);
  const [playerUnits, setPlayerUnits] = useState<PlacedUnit[]>([]);
  const [playerBaselineUnits, setPlayerBaselineUnits] = useState<PlacedUnit[]>([]);
  const [enemyUnits, setEnemyUnits] = useState<PlacedUnit[]>([]);
  const [playerRowShift, setPlayerRowShift] = useState(0);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [matchTerminated, setMatchTerminated] = useState(false);
  const terminationTimeoutRef = useRef<number | null>(null);

  // In-place battle playback state (used when match.status === IN_PROGRESS).
  const [battleTimeline, setBattleTimeline] = useState<BattleTickResult[]>([]);
  const [battleDemoState, setBattleDemoState] = useState<'idle' | 'running' | 'finished'>('idle');
  const [simulationUnits, setSimulationUnits] = useState<PlacedUnit[]>([]);
  const [hitCells, setHitCells] = useState<string[]>([]);
  const [hitEvents, setHitEvents] = useState<BattleTickResult['hitEvents']>([]);
  const [moveCells, setMoveCells] = useState<string[]>([]);
  const [marchCells, setMarchCells] = useState<string[]>([]);
  const [winner, setWinner] = useState<'player' | 'enemy' | 'draw' | null>(null);
  const timelineTimeoutRef = useRef<number | null>(null);
  const timelineIndexRef = useRef(0);
  const pendingWinnerRef = useRef<'player' | 'enemy' | 'draw'>('draw');

  useEffect(() => {
    if (!matchId || !user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);

    fetchMatchBundle(matchId)
      .then((data) => {
        if (cancelled) return;
        setBundle(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load match');
        setBundle(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [matchId, user]);

  // Define handleMatchTerminated early so it can be used in effects
  const handleMatchTerminated = useCallback(
    (message: string) => {
      if (matchTerminated) return;
      setMatchTerminated(true);
      setNotice(message);
      if (terminationTimeoutRef.current) {
        window.clearTimeout(terminationTimeoutRef.current);
      }
      terminationTimeoutRef.current = window.setTimeout(() => {
        navigate('/pvp');
      }, 2500);
    },
    [matchTerminated, navigate]
  );

  useEffect(() => {
    if (!matchId) return;
    const cleanup = subscribeParticipants(matchId, (updated) => {
      setBundle((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map((participant) =>
            participant.id === updated.id
              ? { ...participant, ...updated, display_name: participant.display_name }
              : participant
          )
        };
      });
    });
    return cleanup;
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`match_state_${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          if (!payload.new) return;
          const latest = payload.new as Record<string, unknown>;
          if (latest.id !== matchId) return;
          if (latest.status === 'CANCELLED') {
            handleMatchTerminated('Match aborted. Returning to lobby…');
          }
          if (latest.status === 'IN_PROGRESS') {
            setBundle((prev) => (prev ? { ...prev, match: { ...prev.match, status: 'IN_PROGRESS' } } : prev));
            setNotice('Battle starting…');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleMatchTerminated, matchId, navigate]);

  // Transition legacy PENDING matches into PRE_BATTLE when arriving on the pre-battle page.
  useEffect(() => {
    if (!bundle || bundle.match.status !== 'PENDING') return;

    ensureMatchPreBattle(bundle.match.id)
      .then((updated) => {
        if (!updated) return;
        setBundle((prev) => (prev ? { ...prev, match: { ...prev.match, status: 'PRE_BATTLE' } } : prev));
      })
      .catch((err) => {
        console.error('Failed to set match to PRE_BATTLE:', err);
        setError((prev) => prev ?? (err instanceof Error ? err.message : 'Failed to prepare pre-battle'));
      });
  }, [bundle]);

  // If the match is already in progress when we load, render battle in-place.

  const participants = bundle?.participants ?? [];
  const challenger = participants.find((p) => p.side === 'A');
  const defender = participants.find((p) => p.side === 'B');
  const challengerSubmitted = Boolean(challenger?.pre_battle_adjustments);
  const defenderSubmitted = Boolean(defender?.pre_battle_adjustments);
  const turn: MatchSide | 'LOCKED' = !challengerSubmitted ? 'A' : !defenderSubmitted ? 'B' : 'LOCKED';
  const allSubmitted = challengerSubmitted && defenderSubmitted;

  const yourParticipant = participants.find((p) => p.player_id === user?.id);
  const opponentParticipant = participants.find((p) => p.player_id !== user?.id);

  const playerMatchUnits = useMemo(() => {
    if (!bundle || !yourParticipant) return [] as PositionedUnit[];
    const units = bundle.units.filter((unit) => unit.participant_id === yourParticipant.id);
    return applyMoveToUnits(units, yourParticipant.pre_battle_adjustments ?? null);
  }, [bundle, yourParticipant]);

  const opponentMatchUnits = useMemo(() => {
    if (!bundle || !opponentParticipant) return [] as PositionedUnit[];
    const units = bundle.units.filter((unit) => unit.participant_id === opponentParticipant.id);
    return applyMoveToUnits(units, opponentParticipant.pre_battle_adjustments ?? null);
  }, [bundle, opponentParticipant]);

  const youSubmitted = Boolean(yourParticipant?.pre_battle_adjustments);
  const opponentSubmitted = Boolean(opponentParticipant?.pre_battle_adjustments);
  const isMyTurn = Boolean(yourParticipant && turn !== 'LOCKED' && turn === yourParticipant.side && !youSubmitted);

  const pendingMove = useMemo(() => {
    if (!playerUnits.length || !playerBaselineUnits.length) return null;
    const baselineMap = new Map(playerBaselineUnits.map((unit) => [unit.instanceId, unit]));
    let found: { unit: PlacedUnit; from: Coordinates; to: Coordinates } | null = null;
    let differences = 0;

    for (const unit of playerUnits) {
      const baseline = baselineMap.get(unit.instanceId);
      if (!baseline) continue;
      const from = toActualPosition(baseline.position, playerRowShift);
      const to = toActualPosition(unit.position, playerRowShift);
      if (from.row !== to.row || from.col !== to.col) {
        differences += 1;
        if (differences > 1) {
          return null;
        }
        found = { unit, from, to };
      }
    }

    return found;
  }, [playerBaselineUnits, playerRowShift, playerUnits]);

  useEffect(() => {
    if (!bundle || !yourParticipant) {
      setPlayerUnits([]);
      setPlayerBaselineUnits([]);
      return;
    }

    const positioned = playerMatchUnits;
    const shouldShift = positioned.length > 0 && positioned.every((unit) => unit.row < PLAYER_ZONE_START);
    const shiftAmount = shouldShift ? PLAYER_ZONE_START : 0;
    const placed = buildPlacedUnits(positioned, 'player', (row) => row + shiftAmount, catalogById);
    setPlayerRowShift(shiftAmount);
    setPlayerBaselineUnits(clonePlacedUnits(placed));
    if (!hasLocalDraft) {
      setPlayerUnits(clonePlacedUnits(placed));
    }
  }, [bundle, catalogById, hasLocalDraft, playerMatchUnits, yourParticipant]);

  useEffect(() => {
    if (!bundle || !opponentParticipant) {
      setEnemyUnits([]);
      return;
    }

    const positioned = opponentMatchUnits;
    const mirrorOpponent = positioned.length > 0 && positioned.every((unit) => unit.row >= PLAYER_ZONE_START);
    const rowTransform = mirrorOpponent ? (row: number) => BOARD_SIZE - 1 - row : (row: number) => row;
    const placed = buildPlacedUnits(positioned, 'enemy', rowTransform, catalogById);
    setEnemyUnits(clonePlacedUnits(placed));
  }, [bundle, catalogById, opponentMatchUnits, opponentParticipant]);

  useEffect(() => {
    if (youSubmitted) {
      setHasLocalDraft(false);
      setDraftError(null);
    }
  }, [youSubmitted]);

  const handleBoardChange = useCallback(
    (nextPlayerUnits: PlacedUnit[], nextEnemyUnits: PlacedUnit[]) => {
      if (matchTerminated) return;
      setEnemyUnits(clonePlacedUnits(nextEnemyUnits));
      setPlayerUnits((prevUnits) => {
        const differenceCount = calculateDifferenceCount(nextPlayerUnits, playerBaselineUnits, playerRowShift);
        if (differenceCount > 1) {
          setDraftError('Only one unit can be repositioned during pre-battle. Reset to try a different unit.');
          return prevUnits;
        }
        setDraftError(null);
        setHasLocalDraft(differenceCount === 1);
        return clonePlacedUnits(nextPlayerUnits);
      });
    },
    [matchTerminated, playerBaselineUnits, playerRowShift]
  );

  const handleSubmitMove = useCallback(async () => {
    if (!yourParticipant || matchTerminated) return;

    // Allow submitting even without a move (player chooses to skip adjustment)
    const move: PreBattleMove = pendingMove
      ? {
          kind: 'MOVE',
          from: pendingMove.from,
          to: pendingMove.to,
          submittedAt: new Date().toISOString()
        }
      : {
          kind: 'SKIP',
          submittedAt: new Date().toISOString(),
        };

    setSubmitting(true);
    setError(null);
    try {
      await submitPreBattleMove(yourParticipant.id, move);
      setBundle((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map((participant) =>
            participant.id === yourParticipant.id ? { ...participant, pre_battle_adjustments: move } : participant
          )
        };
      });
      setPlayerBaselineUnits(clonePlacedUnits(playerUnits));
      setHasLocalDraft(false);
      setNotice(move.kind === 'MOVE' ? 'Move locked. Waiting for opponent…' : 'Skip locked. Waiting for opponent…');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit move.');
    } finally {
      setSubmitting(false);
    }
  }, [matchTerminated, pendingMove, playerUnits, yourParticipant]);

  const handleStartBattle = useCallback(async () => {
    if (!bundle) return;
    setNotice('Launching battle...');
    setError(null);
    setSubmitting(true);
    try {
      await startMatch(bundle.match.id);
      // Update local bundle to reflect the new status
      setBundle((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          match: { ...prev.match, status: 'IN_PROGRESS' }
        };
      });
      setNotice('Battle starting…');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start battle.');
    } finally {
      setSubmitting(false);
    }
  }, [bundle]);

  const handleResetMove = useCallback(() => {
    if (matchTerminated) return;
    setPlayerUnits(clonePlacedUnits(playerBaselineUnits));
    setHasLocalDraft(false);
    setDraftError(null);
    setNotice(null);
  }, [matchTerminated, playerBaselineUnits]);

  const handleAbortMatch = useCallback(async () => {
    if (!bundle) return;
    const confirmed = window.confirm('Abort this pre-battle match? This cannot be undone.');
    if (!confirmed) return;
    setError(null);
    setAborting(true);
    try {
      await abortMatch(bundle.match.id);
      setNotice('Match aborted. Returning to lobby…');
      navigate('/pvp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to abort match.');
    } finally {
      setAborting(false);
    }
  }, [bundle, navigate]);

  const handleBackToLobbyAfterBattle = useCallback(async () => {
    if (!bundle) return;
    try {
      setError(null);
      await completeMatch(bundle.match.id);
      navigate('/pvp');
    } catch (err) {
      console.error('Failed to complete match:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete match.');
      // Still navigate away even if completion fails, so player isn't stuck
      setTimeout(() => navigate('/pvp'), 2000);
    }
  }, [bundle, navigate]);

  useEffect(() => {
    return () => {
      if (terminationTimeoutRef.current) {
        window.clearTimeout(terminationTimeoutRef.current);
      }
      if (timelineTimeoutRef.current !== null) {
        window.clearTimeout(timelineTimeoutRef.current);
        timelineTimeoutRef.current = null;
      }
    };
  }, []);

  // When the match flips to IN_PROGRESS, run the existing deterministic battle runner
  // and play back the resulting timeline using ThreeBattleStage.
  const battlePlayerUnits = useMemo(() => {
    if (!bundle || !yourParticipant) return [] as PlacedUnit[];
    const positioned = playerMatchUnits;
    return buildPlacedUnits(positioned, 'player', (row) => row, catalogById);
  }, [bundle, catalogById, playerMatchUnits, yourParticipant]);

  const battleEnemyUnits = useMemo(() => {
    if (!bundle || !opponentParticipant) return [] as PlacedUnit[];
    const positioned = opponentMatchUnits;
    return buildPlacedUnits(positioned, 'enemy', (row) => row, catalogById);
  }, [bundle, catalogById, opponentMatchUnits, opponentParticipant]);

  useEffect(() => {
    if (!bundle) return;
    if (bundle.match.status !== 'IN_PROGRESS') return;
    if (battleDemoState !== 'idle') return;

    // Reset playback state.
    if (timelineTimeoutRef.current !== null) {
      window.clearTimeout(timelineTimeoutRef.current);
      timelineTimeoutRef.current = null;
    }
    timelineIndexRef.current = 0;
    setBattleTimeline([]);
    setSimulationUnits([]);
    setHitCells([]);
    setHitEvents([]);
    setMoveCells([]);
    setMarchCells([]);
    setWinner(null);

    try {
      const playerGoesFirst = yourParticipant?.side === 'A';
      const result = runTrainingBattle({
        playerUnits: battlePlayerUnits,
        enemyUnits: battleEnemyUnits,
        playerGoesFirst,
      });

      pendingWinnerRef.current = result.winner;
      setBattleTimeline(result.timeline);
      timelineIndexRef.current = 1;
      if (result.timeline[0]) {
        setSimulationUnits(result.timeline[0].units);
      }

      if (result.timeline.length <= 1) {
        setWinner(result.winner);
        setBattleDemoState('finished');
        return;
      }

      setBattleDemoState('running');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start battle simulation.');
      setBattleDemoState('idle');
    }
  }, [battleDemoState, battleEnemyUnits, battlePlayerUnits, bundle, yourParticipant?.side]);

  useEffect(() => {
    if (battleDemoState !== 'running' || battleTimeline.length === 0) {
      if (timelineTimeoutRef.current !== null) {
        window.clearTimeout(timelineTimeoutRef.current);
        timelineTimeoutRef.current = null;
      }
      return;
    }

    const playTick = () => {
      const tick = battleTimeline[timelineIndexRef.current];
      if (!tick) {
        setBattleDemoState('finished');
        setWinner(pendingWinnerRef.current);
        return;
      }

      setSimulationUnits(tick.units);
      setHitCells(tick.hits);
      setHitEvents(tick.hitEvents);
      setMoveCells(tick.moves);
      setMarchCells(tick.moves.filter((_, index) => index % 2 === 0));

      if (tick.winner) {
        setWinner(tick.winner);
        setBattleDemoState('finished');
        return;
      }

      if (timelineIndexRef.current >= battleTimeline.length - 1) {
        setWinner(pendingWinnerRef.current);
        setBattleDemoState('finished');
        return;
      }

      timelineIndexRef.current += 1;
      const upcomingTick = battleTimeline[timelineIndexRef.current];
      const tickDuration =
        upcomingTick && upcomingTick.hitEvents.length > 0
          ? calculateTickDuration(upcomingTick.hitEvents, upcomingTick.units)
          : DEFAULT_TICK_MS;

      timelineTimeoutRef.current = window.setTimeout(playTick, Math.max(tickDuration, MIN_TICK_MS));
    };

    timelineTimeoutRef.current = window.setTimeout(playTick, DEFAULT_TICK_MS);

    return () => {
      if (timelineTimeoutRef.current !== null) {
        window.clearTimeout(timelineTimeoutRef.current);
        timelineTimeoutRef.current = null;
      }
    };
  }, [battleTimeline, battleDemoState]);

  if (!user) {
    return (
      <div className="prebattle-shell">
        <div className="prebattle-card">
          <p>Please sign in to view this match.</p>
          <button type="button" className="prebattle-btn" onClick={() => navigate('/login')}>
            Log In
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="prebattle-shell">
        <div className="prebattle-card">
          <p className="prebattle-loading">Loading match intelligence…</p>
        </div>
      </div>
    );
  }

  if (error && !bundle) {
    return (
      <div className="prebattle-shell">
        <div className="prebattle-card">
          <p className="prebattle-error">⚠️ {error}</p>
          <button type="button" className="prebattle-btn" onClick={() => navigate('/pvp')}>
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!bundle || !yourParticipant) {
    return (
      <div className="prebattle-shell">
        <div className="prebattle-card">
          <p>You are not a participant in this match.</p>
          <button type="button" className="prebattle-btn" onClick={() => navigate('/pvp')}>
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const pendingMoveSummary = pendingMove
    ? `${pendingMove.unit.name} ${formatTile(pendingMove.from.row, pendingMove.from.col)} → ${formatTile(pendingMove.to.row, pendingMove.to.col)}`
    : 'Drag a unit within your deployment zone to stage your single adjustment.';
  const turnBanner = turn === 'LOCKED' ? 'Pre-battle locked. Prepare for launch.' : turn === 'A' ? 'Challenger to act.' : 'Defender to act.';
  const canInteract = Boolean(isMyTurn && !youSubmitted && !matchTerminated);
  const canSubmitMove = Boolean(canInteract && !submitting);

  if (bundle.match.status === 'IN_PROGRESS') {
    const winnerLabel = winner ? (winner === 'draw' ? 'Draw' : winner === 'player' ? 'Victory' : 'Defeat') : null;
    return (
      <div className="prebattle-shell">
        <div className="prebattle-banner">
          <p className="banner-kicker">Battlefield</p>
          <h1>PvP BATTLE</h1>
          <p>Status: IN_PROGRESS</p>
        </div>

        {error && <div className="prebattle-error">⚠️ {error}</div>}
        {notice && <div className="prebattle-notice">{notice}</div>}

        <div className="prebattle-stage-section">
          <div className="prebattle-board-wrapper">
            <Suspense
              fallback={
                <div className="stage-loading" role="status" aria-live="polite">
                  Preparing tactical canvas…
                </div>
              }
            >
              <ThreeBattleStage
                boardSize={BOARD_SIZE}
                boardCols={BOARD_COLS}
                units={simulationUnits}
                hitCells={hitCells}
                hitEvents={hitEvents}
                moveCells={moveCells}
                marchCells={marchCells}
                demoState={battleDemoState === 'running' ? 'running' : battleDemoState === 'finished' ? 'finished' : 'idle'}
                interactionMode="battle"
                dragActive={false}
              />
            </Suspense>
          </div>

          <aside className="prebattle-control-card">
            <div className="control-card-header">
              <p className="board-label">Battle Status</p>
              <h2>{winnerLabel ?? (battleDemoState === 'running' ? 'Engaged…' : 'Preparing…')}</h2>
              <p className="board-status">{winnerLabel ? 'Battle finished.' : 'Simulating battle timeline…'}</p>
            </div>

            <div className="prebattle-opponent-meta">
              <h3>Match</h3>
              <p className="board-status">{bundle.match.id.slice(0, 8)}…</p>
              <p className="board-status muted">You: {yourParticipant.display_name ?? 'Commander'}</p>
              <p className="board-status muted">Opponent: {opponentParticipant?.display_name ?? 'Commander'}</p>
            </div>
          </aside>
        </div>

        <div className="prebattle-footer">
          <button type="button" className="prebattle-btn ghost" onClick={handleBackToLobbyAfterBattle}
            disabled={matchTerminated}
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="prebattle-shell">
      <div className="prebattle-banner">
        <p className="banner-kicker">Pre-Battle Directive</p>
        <h1>PRE-BATTLE: ONE MOVE EACH</h1>
        <p>Challenger acts first, defender responds. One precise reposition per commander.</p>
      </div>

      <div className="prebattle-meta-row">
        <div className="meta-card">
          <p className="meta-label">Match</p>
          <h3>{bundle.match.id.slice(0, 8)}…</h3>
          <p className="meta-subtext">Status: {bundle.match.status}</p>
          <p className="meta-subtext">Created: {new Date(bundle.match.created_at).toLocaleString()}</p>
        </div>
        <div className="meta-card">
          <p className="meta-label">Turn State</p>
          <h3>{turnBanner}</h3>
          <p className="meta-subtext">
            {isMyTurn ? 'Your move window is open.' : youSubmitted ? 'Move submitted. Awaiting opponent.' : turn === 'LOCKED' ? 'Both moves locked.' : 'Stand by for your cue.'}
          </p>
        </div>
      </div>

      {error && bundle && <div className="prebattle-error">⚠️ {error}</div>}
      {notice && <div className="prebattle-notice">{notice}</div>}

      <div className="prebattle-stage-section">
        <div className="prebattle-board-wrapper">
          <BoardSetupPanel
            mode="training"
            trainingBoard="player"
            playerUnits={playerUnits}
            enemyUnits={enemyUnits}
            onChange={handleBoardChange}
            allowedEdits={{ repositions: canInteract ? 1 : 0, behaviorChanges: 0 }}
            locks={{ restrictToActiveArea: false, restrictToOwnZone: true, disallowAddRemove: true, enemyLocked: true }}
            canEditBehavior={() => false}
          />
        </div>

        <aside className="prebattle-control-card">
          <div className="control-card-header">
            <p className="board-label">Command Summary</p>
            <h2>{yourParticipant.display_name ?? 'You'}</h2>
            <p className="board-status">{summarizeMove(yourParticipant.pre_battle_adjustments ?? null)}</p>
          </div>

          <div className="prebattle-status-pills">
            <span className={`prebattle-status-pill ${canInteract ? 'active' : ''}`}>
              {youSubmitted ? 'Move locked' : canInteract ? 'Your window is open' : 'Stand by'}
            </span>
            <span className="prebattle-status-pill muted">
              {opponentSubmitted ? 'Opponent locked' : 'Opponent adjusting'}
            </span>
          </div>

          <div className="prebattle-move-summary">
            <h3>Staged Adjustment</h3>
            <p>{pendingMoveSummary}</p>
          </div>

          {draftError && <p className="prebattle-control-error">{draftError}</p>}

          <div className="prebattle-control-actions">
            <button type="button" className="prebattle-btn ghost" onClick={handleResetMove} disabled={!pendingMove || youSubmitted}>
              Reset move
            </button>
            <button
              type="button"
              className="prebattle-btn accent"
              onClick={handleSubmitMove}
              disabled={!canSubmitMove}
            >
              {submitting ? 'Submitting…' : pendingMove ? 'Confirm move' : 'Skip changes'}
            </button>
          </div>

          <div className="prebattle-opponent-meta">
            <h3>Opponent Forces</h3>
            <p className="board-status">{summarizeMove(opponentParticipant?.pre_battle_adjustments ?? null)}</p>
            <p className="board-status muted">
              {opponentSubmitted ? 'Opponent move locked.' : 'Waiting for opponent move…'}
            </p>
          </div>
        </aside>
      </div>

      <div className="prebattle-footer">
        <button type="button" className="prebattle-btn ghost" onClick={handleBackToLobbyAfterBattle}>
          Back to Lobby
        </button>
        <button type="button" className="prebattle-btn danger" onClick={handleAbortMatch} disabled={aborting}>
          {aborting ? 'Aborting…' : 'Abort battle'}
        </button>
        {allSubmitted && (
          <button
            type="button"
            className="prebattle-btn accent"
            onClick={handleStartBattle}
            disabled={submitting}
          >
            {submitting ? 'Starting…' : 'START BATTLE'}
          </button>
        )}
      </div>

      {allSubmitted && (
        <p className="prebattle-footer-note">
          Both players ready. Click START BATTLE to proceed.
        </p>
      )}
    </div>
  );
};

export default PvpMatch;
