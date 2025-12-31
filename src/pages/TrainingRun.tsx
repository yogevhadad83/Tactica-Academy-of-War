import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlayerContext } from '../context/PlayerContext';
import { supabase } from '../lib/supabaseClient';
import { trainingDrills } from '../data/trainingDrills';
import type { BattleTickResult, Team } from '../engine/battleEngine';
import { BOARD_COLS, BOARD_SIZE } from '../engine/battleEngine';
import type { PlacedUnit } from '../types';
import type { DemoState } from '../types/battle';
import { calculateTickDuration } from '../components/units/useUnitLayer';
import { runTrainingBattle } from '../engine/runTrainingBattle';
import { addGuestCredits, getTrainingState, hasCompleted, markCompleted } from '../utils/trainingProgress';
import { validatePlacementsInBounds } from '../utils/validatePlacementsInBounds';
import BoardSetupPanel from '../components/BoardSetupPanel';
import './TrainingRun.css';

const ThreeBattleStage = lazy(() => import('../components/ThreeBattleStage'));

const DEFAULT_TICK_MS = 2000;
const MIN_TICK_MS = 800;

type OutcomeState = 'win' | 'lose' | 'draw' | 'pending';

const TrainingRun = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userIdOrNull = user?.id ?? null;
  const { player, setPlayerCredits, refresh: refreshPlayer } = usePlayerContext();
  const module = trainingDrills.find((m) => m.id === id) ?? null;

  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [phase, setPhase] = useState<'setup' | 'playback'>('setup');
  const [battleTimeline, setBattleTimeline] = useState<BattleTickResult[]>([]);
  const [simulationUnits, setSimulationUnits] = useState<PlacedUnit[]>([]);
  const [hitCells, setHitCells] = useState<string[]>([]);
  const [hitEvents, setHitEvents] = useState<BattleTickResult['hitEvents']>([]);
  const [moveCells, setMoveCells] = useState<string[]>([]);
  const [marchCells, setMarchCells] = useState<string[]>([]);
  const [winner, setWinner] = useState<Team | 'draw' | null>(null);
  const [startingTeam, setStartingTeam] = useState<Team>('player');
  const [rewardGranted, setRewardGranted] = useState<number>(0);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [progressVersion, setProgressVersion] = useState(0);

  const [setupPlayerUnits, setSetupPlayerUnits] = useState<PlacedUnit[]>([]);
  const [setupEnemyUnits, setSetupEnemyUnits] = useState<PlacedUnit[]>([]);
  const [repositionsRemaining, setRepositionsRemaining] = useState<number>(0);
  const [behaviorChangesRemaining, setBehaviorChangesRemaining] = useState<number>(0);

  const timelineTimeoutRef = useRef<number | null>(null);
  const timelineIndexRef = useRef(0);
  const rewardAppliedRef = useRef(false);
  const wasReplayRef = useRef(false);
  const pendingWinnerRef = useRef<Team | 'draw'>('draw');

  const trainingState = useMemo(() => getTrainingState(userIdOrNull), [userIdOrNull, progressVersion]);
  const completed = useMemo(() => new Set(trainingState.completedModuleIds), [trainingState.completedModuleIds]);

  const nextIncompleteModule = useMemo(() => {
    return trainingDrills.find((m) => !completed.has(m.id)) ?? null;
  }, [completed]);

  useEffect(() => {
    if (!module) return;
    setPhase('setup');
    setDemoState('idle');
    setBattleTimeline([]);
    setSimulationUnits([]);
    setHitCells([]);
    setHitEvents([]);
    setMoveCells([]);
    setMarchCells([]);
    setWinner(null);
    setRewardGranted(0);
    setRewardError(null);
    setConfigError(null);

    setSetupPlayerUnits(
      module.playerStartBoard.map((u) => ({
        ...u,
        position: { ...u.position },
        currentHp: u.currentHp ?? u.hp,
        currentShield: u.currentShield ?? u.shield ?? 0,
      }))
    );
    setSetupEnemyUnits(
      module.opponentStartBoard.map((u) => ({
        ...u,
        position: { ...u.position },
        currentHp: u.currentHp ?? u.hp,
        currentShield: u.currentShield ?? u.shield ?? 0,
      }))
    );
    setRepositionsRemaining(module.allowedEdits.maxRepositions);
    setBehaviorChangesRemaining(module.allowedEdits.maxBehaviorChanges);
  }, [module?.id]);

  const previewUnits = useMemo(() => {
    if (!module) return [] as PlacedUnit[];
    const combined = [...setupPlayerUnits, ...setupEnemyUnits];
    return combined;
  }, [module, setupEnemyUnits, setupPlayerUnits]);

  const playArea = module?.playArea ?? null;

  const isInsidePlayArea = useCallback(
    (row: number, col: number) => {
      if (!playArea) return true;
      const inCols = col >= playArea.colStart && col < playArea.colStart + playArea.cols;
      const inEnemyRows = row >= playArea.enemyRowStart && row < playArea.enemyRowStart + playArea.rowsPerSide;
      const inPlayerRows = row >= playArea.playerRowStart && row < playArea.playerRowStart + playArea.rowsPerSide;
      return inCols && (inEnemyRows || inPlayerRows);
    },
    [playArea]
  );

  const previewValidation = useMemo(() => {
    if (!module) return { ok: true as const };
    const bounds = validatePlacementsInBounds(previewUnits, BOARD_COLS, BOARD_SIZE);
    if (!bounds.ok) {
      const { unitId, col, row } = bounds.error;
      return { ok: false as const, message: `Invalid drill config: unit out of bounds: ${unitId} at (${col},${row})` };
    }
    if (playArea) {
      const offender = previewUnits.find((u) => !isInsidePlayArea(u.position.row, u.position.col));
      if (offender) {
        const unitId = offender.instanceId ?? offender.id;
        return {
          ok: false as const,
          message: `Invalid drill config: unit outside play area: ${unitId} at (${offender.position.col},${offender.position.row})`
        };
      }
    }
    return { ok: true as const };
  }, [isInsidePlayArea, module, playArea, previewUnits]);

  const outcome: OutcomeState = useMemo(() => {
    if (!winner) return 'pending';
    if (winner === 'draw') return 'draw';
    return winner === 'player' ? 'win' : 'lose';
  }, [winner]);

  const stageUnits = demoState === 'idle' ? previewUnits : simulationUnits;

  // Prevent rendering floating units: show board but with no units when config invalid.
  const safeStageUnits = previewValidation.ok ? stageUnits : ([] as PlacedUnit[]);

  useEffect(() => {
    setConfigError(previewValidation.ok ? null : previewValidation.message);
  }, [previewValidation]);

  if (!module) {
    return (
      <div className="training-run-page">
        <div className="training-run-card">
          <h1 className="training-run-title">Drill not found</h1>
          <Link className="training-run-link" to="/training">
            Back to Training
          </Link>
        </div>
      </div>
    );
  }

  const resetPlayback = useCallback(() => {
    if (timelineTimeoutRef.current !== null) {
      window.clearTimeout(timelineTimeoutRef.current);
      timelineTimeoutRef.current = null;
    }
    timelineIndexRef.current = 0;
    setDemoState('idle');
    setBattleTimeline([]);
    setSimulationUnits([]);
    setHitCells([]);
    setHitEvents([]);
    setMoveCells([]);
    setMarchCells([]);
    setWinner(null);
    setRewardGranted(0);
    setRewardError(null);
    setConfigError(null);
    rewardAppliedRef.current = false;
    wasReplayRef.current = false;
    pendingWinnerRef.current = 'draw';

    setPhase('setup');
  }, []);

  const startDrill = useCallback(() => {
    if (!module) return;

    // Validate before simulation.
    if (!previewValidation.ok) {
      setConfigError(previewValidation.message);
      return;
    }

    setRewardError(null);
    setRewardGranted(0);
    rewardAppliedRef.current = false;

    const replay = hasCompleted(module.id, userIdOrNull);
    wasReplayRef.current = replay;

    const starting: Team = module.playerGoesFirst ? 'player' : 'enemy';
    setStartingTeam(starting);

    const result = runTrainingBattle({
      playerUnits: setupPlayerUnits,
      enemyUnits: setupEnemyUnits,
      playerGoesFirst: module.playerGoesFirst,
    });

    pendingWinnerRef.current = result.winner === 'draw' ? 'draw' : result.winner;
    setBattleTimeline(result.timeline);
    setWinner(null);
    setHitCells([]);
    setHitEvents([]);
    setMoveCells([]);
    setMarchCells([]);

    timelineIndexRef.current = 1;
    if (result.timeline[0]) {
      setSimulationUnits(result.timeline[0].units);
    }

    if (result.timeline.length <= 1) {
      setWinner(result.winner === 'draw' ? 'draw' : result.winner);
      setDemoState('finished');
      return;
    }

    setPhase('playback');
    setDemoState('running');
  }, [module, previewValidation, setupEnemyUnits, setupPlayerUnits, userIdOrNull]);

  // If the runner throws (config invalid), surface the exact error and keep idle.
  useEffect(() => {
    if (!configError) return;
    if (demoState === 'running') {
      resetPlayback();
    }
  }, [configError, demoState, resetPlayback]);

  useEffect(() => {
    if (demoState !== 'running' || battleTimeline.length === 0) {
      if (timelineTimeoutRef.current !== null) {
        window.clearTimeout(timelineTimeoutRef.current);
        timelineTimeoutRef.current = null;
      }
      return;
    }

    const playTick = () => {
      const tick = battleTimeline[timelineIndexRef.current];
      if (!tick) {
        setDemoState('finished');
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
        setDemoState('finished');
        return;
      }

      if (timelineIndexRef.current >= battleTimeline.length - 1) {
        setWinner(pendingWinnerRef.current);
        setDemoState('finished');
        return;
      }

      timelineIndexRef.current += 1;
      const upcomingTick = battleTimeline[timelineIndexRef.current];
      const tickDuration = upcomingTick && upcomingTick.hitEvents.length > 0
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
  }, [battleTimeline, demoState]);

  useEffect(() => {
    if (!module) return;
    if (demoState !== 'finished') return;
    if (rewardAppliedRef.current) return;
    if (winner !== 'player') return;

    rewardAppliedRef.current = true;

    const alreadyCompleted = hasCompleted(module.id, userIdOrNull);
    if (alreadyCompleted) {
      setRewardGranted(0);
      return;
    }

    const applyReward = async () => {
      const reward = module.rewardCredits;
      if (!reward || reward <= 0) {
        markCompleted(module.id, userIdOrNull);
        setProgressVersion((v) => v + 1);
        setRewardGranted(0);
        return;
      }

      try {
        if (!userIdOrNull) {
          addGuestCredits(reward);
        } else {
          const currentCredits = player?.current_credits ?? 0;
          const nextCredits = currentCredits + reward;

          const { error } = await supabase
            .from('players')
            .update({ current_credits: nextCredits })
            .eq('id', userIdOrNull);

          if (error) {
            throw error;
          }

          setPlayerCredits(nextCredits);
          refreshPlayer();
        }

        markCompleted(module.id, userIdOrNull);
        setProgressVersion((v) => v + 1);
        setRewardGranted(reward);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to apply rewards';
        setRewardGranted(0);
        setRewardError(message);
      }
    };

    void applyReward();
  }, [demoState, module, player?.current_credits, refreshPlayer, setPlayerCredits, userIdOrNull, winner]);

  const goNext = useCallback(() => {
    if (!nextIncompleteModule) {
      navigate('/training');
      return;
    }
    navigate(`/training/${nextIncompleteModule.id}`);
  }, [navigate, nextIncompleteModule]);

  return (
    <div className="training-run-page">
      <div className="training-run-card">
        <div className="training-run-header">
          <h1 className="training-run-title">{module.title}</h1>
          <div className="training-run-reward">Reward: +{module.rewardCredits} credits (one-time)</div>
        </div>

        <p className="training-run-desc">{module.description}</p>
        <pre className="training-run-brief">{module.instructorBrief}</pre>

        {phase === 'setup' ? (
          <div className="training-run-setup">
            {playArea && (
              <div className="training-run-playarea-legend" aria-label="Play area">
                Active area: {playArea.cols}×{playArea.rowsPerSide} per side (cols {playArea.colStart + 1}–{playArea.colStart + playArea.cols})
              </div>
            )}

            {configError && (
              <div className="training-run-config-error" role="alert">
                {configError}
              </div>
            )}

            <BoardSetupPanel
              mode="training"
              trainingBoard="player"
              playerUnits={setupPlayerUnits}
              enemyUnits={setupEnemyUnits}
              onChange={(nextPlayer, nextEnemy) => {
                setSetupPlayerUnits(nextPlayer);
                setSetupEnemyUnits(nextEnemy);
              }}
              activeArea={playArea ?? undefined}
              allowedEdits={{ repositions: repositionsRemaining, behaviorChanges: behaviorChangesRemaining }}
              locks={{ restrictToActiveArea: Boolean(playArea), restrictToOwnZone: true, disallowAddRemove: true, enemyLocked: true }}
              onRepositionUsed={() => setRepositionsRemaining((prev) => Math.max(0, prev - 1))}
              onBehaviorChangeUsed={() => setBehaviorChangesRemaining((prev) => Math.max(0, prev - 1))}
              canEditBehavior={(unit) => {
                if (!module) return false;
                const allowedIds = new Set(module.allowedEdits.behaviorChangeUnitIds.map((id) => id.toLowerCase()));
                return unit.team === 'player' && allowedIds.has(unit.id.toLowerCase());
              }}
            />
          </div>
        ) : (
          <div className="training-run-stage">
            {playArea && (
              <div className="training-run-playarea-legend" aria-label="Play area">
                Active area: {playArea.cols}×{playArea.rowsPerSide} per side (cols {playArea.colStart + 1}–{playArea.colStart + playArea.cols})
              </div>
            )}

            {configError && (
              <div className="training-run-config-error" role="alert">
                {configError}
              </div>
            )}

            <Suspense
              fallback={
                <div className="training-run-stage-loading" role="status" aria-live="polite">
                  Preparing battle stage…
                </div>
              }
            >
              <ThreeBattleStage
                boardSize={BOARD_SIZE}
                boardCols={BOARD_COLS}
                units={safeStageUnits}
                hitCells={demoState === 'idle' ? [] : hitCells}
                hitEvents={demoState === 'idle' ? [] : hitEvents}
                moveCells={demoState === 'idle' ? [] : moveCells}
                marchCells={demoState === 'idle' ? [] : marchCells}
                demoState={demoState}
                interactionMode="battle"
                dragActive={false}
                forceOwner={undefined}
              />
            </Suspense>

            {playArea && (
              <div className="training-run-playarea-mask" aria-hidden="true">
                {Array.from({ length: BOARD_SIZE * BOARD_COLS }).map((_, index) => {
                  const row = Math.floor(index / BOARD_COLS);
                  const col = index % BOARD_COLS;
                  const outside = !isInsidePlayArea(row, col);
                  return <div key={`${row}-${col}`} className={outside ? 'mask-cell outside' : 'mask-cell inside'} />;
                })}
              </div>
            )}

            <div className="training-run-stage-meta" aria-label="Battle info">
              <div className="training-run-stage-pill">
                First turn: {startingTeam === 'player' ? 'Player' : 'Opponent'}
              </div>
              {demoState === 'running' && <div className="training-run-stage-pill">Playback running…</div>}
              {demoState === 'finished' && winner && (
                <div className="training-run-stage-pill">
                  Result: {winner === 'draw' ? 'Draw' : winner === 'player' ? 'Win' : 'Loss'}
                </div>
              )}
            </div>
          </div>
        )}

        {demoState === 'finished' && winner && (
          <div className="training-run-result" role="status">
            <h2 className="training-run-result-title">
              {outcome === 'win' ? 'Drill Complete' : outcome === 'lose' ? 'Drill Failed' : 'Drill Complete (Draw)'}
            </h2>
            <div className="training-run-result-row">
              <div className="training-run-result-label">Outcome</div>
              <div className="training-run-result-value">
                {outcome === 'win' ? 'Win' : outcome === 'lose' ? 'Loss' : 'Draw'}
              </div>
            </div>
            <div className="training-run-result-row">
              <div className="training-run-result-label">Credits granted</div>
              <div className="training-run-result-value">+{wasReplayRef.current ? 0 : rewardGranted}</div>
            </div>
            {rewardError && <div className="training-run-result-error">Reward error: {rewardError}</div>}
            <div className="training-run-result-actions">
              <Link className="training-run-link" to="/training">
                Back to Training
              </Link>
              <button type="button" className="training-run-btn primary" onClick={goNext}>
                Next Drill
              </button>
            </div>
          </div>
        )}

        <div className="training-run-actions">
          <button
            type="button"
            className={`training-run-btn ${demoState !== 'running' ? 'primary' : ''}`}
            onClick={startDrill}
            disabled={demoState === 'running' || Boolean(configError)}
          >
            {demoState === 'running' ? 'Running…' : demoState === 'finished' ? 'Restart Drill' : 'Start Drill'}
          </button>
          {phase === 'playback' && demoState !== 'idle' && (
            <button type="button" className="training-run-btn" onClick={resetPlayback}>
              Reset
            </button>
          )}
          <Link className="training-run-link" to="/training">
            Back
          </Link>
        </div>
      </div>
    </div>
  );
};

export default TrainingRun;
