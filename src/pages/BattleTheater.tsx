import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import './BattleTheater.css';
import { BOARD_COLS, BOARD_SIZE } from '../engine/battleEngine';
import { boardKey } from '../constants/board';
import type { BattleTickResult } from '../engine/battleEngine';
import type { PlacedUnit } from '../types';
import { calculateTickDuration } from '../components/units/useUnitLayer';
import { useAuth } from '../context/AuthContext';
import { completeMatch, fetchMatchBundle, type MatchBundle } from '../lib/pvp';
import type { MatchSide, WinnerSide } from '../types/supabase';
import { useMatchTimeline } from '../hooks/useMatchTimeline';
import { useFullscreen } from '../hooks/useFullscreen';
import BattleResultOverlay from '../components/BattleResultOverlay';
import type { TrainingModule } from '../data/trainingDrills';

const ThreeBattleStage = lazy(() => import('../components/ThreeBattleStage'));

const DEFAULT_TICK_MS = 2000;
const MIN_TICK_MS = 800;

type PlaybackState = 'idle' | 'playing' | 'paused' | 'finished';

type ViewerOutcome = 'player' | 'enemy' | 'draw' | null;

type DemoOrTrainingState = {
  mode?: 'demo' | 'training';
  matchId?: string;
  timelineA?: BattleTickResult[];
  timelineB?: BattleTickResult[] | null;
  winnerSide?: WinnerSide | 'draw';
  moduleId?: string;
  moduleTitle?: string;
  exitTo?: string;
  playArea?: TrainingModule['playArea'] | null;
};

const mapWinnerSideToViewer = (side: WinnerSide | null, viewerSide: MatchSide | null): ViewerOutcome => {
  if (!side || side === 'draw' || !viewerSide) return 'draw';
  return side === viewerSide ? 'player' : 'enemy';
};

const isMatchNotFoundMessage = (message: string | null) => {
  if (!message) return false;
  return /match\s+.*not\s+found/i.test(message) || /match\s+not\s+found/i.test(message);
};

const formatParticipant = (bundle: MatchBundle | null, side: MatchSide) =>
  bundle?.participants.find((p) => p.side === side)?.display_name ?? `Side ${side}`;

const BattleTheater = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const location = useLocation();
  const demoState = (location.state as DemoOrTrainingState | null | undefined) ?? null;
  const isDemo = demoState?.mode === 'demo';
  const isTraining = demoState?.mode === 'training';
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bundle, setBundle] = useState<MatchBundle | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2>(1);
  const [simulationUnits, setSimulationUnits] = useState<PlacedUnit[]>([]);
  const [hitCells, setHitCells] = useState<string[]>([]);
  const [hitEvents, setHitEvents] = useState<BattleTickResult['hitEvents']>([]);
  const [moveCells, setMoveCells] = useState<string[]>([]);
  const [marchCells, setMarchCells] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [winner, setWinner] = useState<ViewerOutcome>(null);
  const [showResult, setShowResult] = useState(false);
  const playbackTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [controlMessage, setControlMessage] = useState<string | null>(null);
  const [stageReady, setStageReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const completingRef = useRef(false);
  const redirectedRef = useRef(false);

  const {
    timelineA: fetchedTimelineA,
    timelineB: fetchedTimelineB,
    winnerSide: fetchedWinnerSide,
    loading: fetchedTimelineLoading,
    error: fetchedTimelineError,
    refresh: fetchTimeline,
  } = useMatchTimeline(isDemo || isTraining ? null : matchId);
  const timelineA = isDemo || isTraining ? demoState?.timelineA ?? null : fetchedTimelineA;
  const timelineB = isDemo || isTraining ? demoState?.timelineB ?? null : fetchedTimelineB;
  const winnerSide = isDemo || isTraining ? ((demoState?.winnerSide ?? null) as WinnerSide | null) : fetchedWinnerSide;
  const timelineLoading = isDemo || isTraining ? false : fetchedTimelineLoading;
  const timelineError = isDemo || isTraining ? null : fetchedTimelineError;
  const refresh = isDemo || isTraining ? () => {} : fetchTimeline;
  const { isFullscreen, isSupported: fullscreenSupported, error: fullscreenError, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen();

  // Lock body scroll while in theater
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.classList.add('theater-body-lock');
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('theater-body-lock');
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (!matchId || isDemo || isTraining) return;
    let cancelled = false;
    setBundleError(null);
    fetchMatchBundle(matchId)
      .then((data) => {
        if (cancelled) return;
        setBundle(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setBundleError(err instanceof Error ? err.message : 'Failed to load match.');
      });
    return () => {
      cancelled = true;
    };
  }, [isDemo, isTraining, matchId]);

  useEffect(() => {
    if (redirectedRef.current) return;
    if (isDemo || isTraining) return;

    if (!matchId) {
      redirectedRef.current = true;
      navigate('/academy', {
        replace: true,
        state: { toastMessage: 'Match id not found. Returned to Academy.' },
      });
      return;
    }

    const message = isMatchNotFoundMessage(bundleError)
      ? bundleError
      : isMatchNotFoundMessage(timelineError)
        ? timelineError
        : null;

    if (!message) return;

    redirectedRef.current = true;
    navigate('/academy', {
      replace: true,
      state: { toastMessage: message },
    });
  }, [bundleError, isDemo, isTraining, matchId, navigate, timelineError]);

  const viewerSide = useMemo<MatchSide | null>(() => {
    if (isDemo || isTraining) return 'A';
    if (!bundle || !user) return null;
    const participant = bundle.participants.find((p) => p.player_id === user.id);
    return participant?.side ?? null;
  }, [bundle, isDemo, isTraining, user]);

  const viewerTimeline = useMemo(() => {
    if (viewerSide === 'A') return timelineA;
    if (viewerSide === 'B') return timelineB;
    return timelineA ?? timelineB;
  }, [timelineA, timelineB, viewerSide]);

  const pendingWinner = useMemo(() => mapWinnerSideToViewer(winnerSide, viewerSide), [viewerSide, winnerSide]);

  const trainingExitTo = demoState?.exitTo ?? '/training';
  const trainingPlayArea = isTraining ? demoState?.playArea ?? null : null;

  const disabledCells = useMemo(() => {
    if (!isTraining || !trainingPlayArea) return [] as string[];
    const { cols, colStart, rowsPerSide, playerRowStart, enemyRowStart } = trainingPlayArea;
    const cells: string[] = [];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const inCols = col >= colStart && col < colStart + cols;
        const inEnemyRows = row >= enemyRowStart && row < enemyRowStart + rowsPerSide;
        const inPlayerRows = row >= playerRowStart && row < playerRowStart + rowsPerSide;
        const enabled = inCols && (inEnemyRows || inPlayerRows);
        if (!enabled) {
          cells.push(boardKey(row, col));
        }
      }
    }

    return cells;
  }, [isTraining, trainingPlayArea]);

  const applyTick = useCallback((tick: BattleTickResult | undefined) => {
    if (!tick) return;
    setSimulationUnits(tick.units);
    setHitCells(tick.hits ?? []);
    setHitEvents(tick.hitEvents ?? []);
    setMoveCells(tick.moves ?? []);
    setMarchCells((tick.moves ?? []).filter((_, idx) => idx % 2 === 0));
    if (tick.winner) {
      setWinner(tick.winner as ViewerOutcome);
      setPlaybackState('finished');
      setShowResult(true);
    }
  }, []);

  // Initialize playback when timeline arrives
  useEffect(() => {
    if (!viewerTimeline || viewerTimeline.length === 0) return;
    setCurrentIndex(0);
    setShowResult(false);
    setWinner(null);
    applyTick(viewerTimeline[0]);
    // Start as idle, will switch to playing when stage is ready
    setPlaybackState('idle');
  }, [applyTick, viewerTimeline]);

  // Start playback once visuals are shown and the camera has finished its approach
  useEffect(() => {
    if (!stageReady || !cameraReady) return;
    if (!viewerTimeline || viewerTimeline.length === 0) return;
    if (playbackState === 'idle') {
      setPlaybackState('playing');
    }
  }, [cameraReady, stageReady, playbackState, viewerTimeline]);

  // Reset camera readiness when we hide the stage
  useEffect(() => {
    if (!stageReady) {
      setCameraReady(false);
    }
  }, [stageReady]);

  // Advance playback
  useEffect(() => {
    if (playbackState !== 'playing' || !viewerTimeline || viewerTimeline.length === 0) {
      if (playbackTimerRef.current !== null) {
        window.clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      return () => {};
    }

    const nextIndex = currentIndex + 1;
    const nextTick = viewerTimeline[nextIndex];
    if (!nextTick) {
      setPlaybackState('finished');
      setWinner((prev) => prev ?? pendingWinner);
      setShowResult(true);
      return () => {};
    }

    const duration = Math.max(
      calculateTickDuration(nextTick.hitEvents ?? [], nextTick.units ?? []),
      MIN_TICK_MS
    ) / playbackSpeed;

    playbackTimerRef.current = window.setTimeout(() => {
      setCurrentIndex(nextIndex);
      applyTick(nextTick);
      if (nextIndex >= viewerTimeline.length - 1) {
        setPlaybackState('finished');
        setWinner((prev) => prev ?? pendingWinner);
        setShowResult(true);
      }
    }, duration || DEFAULT_TICK_MS / playbackSpeed);

    return () => {
      if (playbackTimerRef.current !== null) {
        window.clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [applyTick, currentIndex, pendingWinner, playbackSpeed, playbackState, viewerTimeline]);

  const handlePlayPause = useCallback(() => {
    if (!viewerTimeline || viewerTimeline.length === 0) return;
    if (playbackState === 'playing') {
      setPlaybackState('paused');
      return;
    }
    if (playbackState === 'finished') {
      setCurrentIndex(0);
      applyTick(viewerTimeline[0]);
    }
    setPlaybackState('playing');
  }, [applyTick, playbackState, viewerTimeline]);

  const handleReplay = useCallback(() => {
    if (!viewerTimeline || viewerTimeline.length === 0) return;
    setCurrentIndex(0);
    setWinner(null);
    setShowResult(false);
    applyTick(viewerTimeline[0]);
    setPlaybackState('playing');
  }, [applyTick, viewerTimeline]);

  const handleFullscreenToggle = useCallback(() => {
    toggleFullscreen(containerRef.current ?? undefined);
  }, [toggleFullscreen]);

  const settleMatch = useCallback(async () => {
    if (isDemo || isTraining) return;
    if (completingRef.current) return;
    if (!bundle) return;
    if (bundle.match.status === 'COMPLETED') return;
    completingRef.current = true;
    try {
      await completeMatch(bundle.match.id);
    } catch (err) {
      console.error('Failed to complete match', err);
    } finally {
      completingRef.current = false;
    }
  }, [bundle, isDemo, isTraining]);

  const handleBack = async () => {
    if (isDemo) {
      navigate('/war-room');
      return;
    }
    if (isTraining) {
      navigate(trainingExitTo);
      return;
    }
    await settleMatch();
    navigate('/academy');
  };

  const handleAfterAction = async () => {
    if (isDemo || isTraining) {
      await handleBack();
      return;
    }
    if (!matchId) return;
    await settleMatch();
    navigate(`/after-action/${matchId}`);
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        event.preventDefault();
        handlePlayPause();
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        handleFullscreenToggle();
      }
      if (event.key === 'Escape') {
        exitFullscreen();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [exitFullscreen, handleFullscreenToggle, handlePlayPause]);

  useEffect(() => {
    if (fullscreenError) {
      setControlMessage(fullscreenError);
    }
  }, [fullscreenError]);

  const timelineReady = Boolean(viewerTimeline && viewerTimeline.length);
  const displayMatchId = isDemo || isTraining ? demoState?.matchId ?? matchId ?? undefined : matchId;
  const matchLabel = isTraining
    ? demoState?.moduleTitle ?? 'Training Battle'
    : isDemo
      ? 'Demo Battle'
      : displayMatchId
        ? `Match ${displayMatchId.slice(0, 8)}...`
        : 'Match';
  const outcome = winner ?? pendingWinner ?? 'draw';
  const winnerLabel = isTraining
    ? outcome === 'draw'
      ? 'Training result: Draw'
      : outcome === 'player'
        ? 'Cadet prevailed'
        : 'Opponent prevailed'
    : outcome === 'draw'
      ? 'Stalemate'
      : outcome === 'player'
        ? `${formatParticipant(bundle, viewerSide ?? 'A')} prevailed`
        : `${formatParticipant(bundle, viewerSide === 'A' ? 'B' : viewerSide === 'B' ? 'A' : 'B')} prevailed`;
  const summaryLines = [
    isTraining && demoState?.moduleTitle ? `Training: ${demoState.moduleTitle}` : winnerLabel,
    `${viewerTimeline?.length ?? 0} frames recorded`,
  ];
  const backLabel = isTraining ? 'Back to Training' : isDemo ? 'Back to War Room' : 'Back to Academy';
  const backButtonLabel = isTraining ? '← Training' : isDemo ? '← War Room' : '← Back';

  return (
    <div className="battle-theater-shell" ref={containerRef}>
      <div className="battle-theater-inner">
        <header className="battle-theater-header">
          <div className="battle-theater-left">
            <button type="button" className="battle-theater-back" onClick={handleBack} aria-label={backLabel}>
              {backButtonLabel}
            </button>
            <div className="battle-theater-title">
              <h1>Battle Theater</h1>
              <span>{matchLabel}</span>
            </div>
          </div>
          <div className="battle-theater-right">
            <button type="button" onClick={handlePlayPause} aria-label="Play or pause battle">
              {playbackState === 'playing' ? 'Pause' : playbackState === 'finished' ? 'Replay' : 'Play'}
            </button>
            <div className="speed-toggle" aria-label="Playback speed">
              <button
                type="button"
                onClick={() => setPlaybackSpeed(1)}
                aria-pressed={playbackSpeed === 1}
              >
                1x
              </button>
              <button
                type="button"
                onClick={() => setPlaybackSpeed(2)}
                aria-pressed={playbackSpeed === 2}
              >
                2x
              </button>
            </div>
            <button
              type="button"
              onClick={handleFullscreenToggle}
              disabled={!fullscreenSupported}
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            </button>
          </div>
        </header>

        <div className="battle-theater-stage">
          <div className="battle-stage-viewport">
            {timelineError && <div className="fullscreen-error">{timelineError}</div>}
            {bundleError && <div className="fullscreen-error">{bundleError}</div>}
            {controlMessage && <div className="fullscreen-error">{controlMessage}</div>}
            {!stageReady && timelineReady && (
              <div className="stage-loading" role="status" aria-live="polite">
                Loading battlefield...
              </div>
            )}
            <Suspense fallback={<div className="stage-loading">Preparing battlefield...</div>}>
              {timelineReady ? (
                <ThreeBattleStage
                  boardSize={BOARD_SIZE}
                  boardCols={BOARD_COLS}
                  units={simulationUnits}
                  hitCells={hitCells}
                  hitEvents={hitEvents}
                  moveCells={moveCells}
                  marchCells={marchCells}
                  disabledCells={disabledCells}
                  demoState={playbackState === 'playing' ? 'running' : playbackState === 'finished' ? 'finished' : 'idle'}
                  interactionMode="battle"
                  onReady={setStageReady}
                  onCameraReady={setCameraReady}
                />
              ) : (
                <div className="stage-loading" role="status" aria-live="polite">
                  {timelineLoading ? 'Retrieving server timeline...' : 'Waiting for battle record...'}
                </div>
              )}
            </Suspense>
          </div>

          <div className="battle-hud">
            <div className="battle-hud-controls">
              <button type="button" onClick={handlePlayPause} aria-label="Play or pause">{playbackState === 'playing' ? 'Pause' : 'Play'}</button>
              <button type="button" onClick={handleReplay} aria-label="Replay from start">Replay</button>
              <button type="button" onClick={refresh} aria-label="Refresh timeline">Refresh</button>
            </div>
            <div className="battle-hud-meta">
              <div className="hud-chip">
                <strong>Status</strong>
                <span>{playbackState === 'finished' ? 'Complete' : timelineLoading ? 'Loading timeline' : playbackState === 'playing' ? 'Playing' : 'Paused'}</span>
              </div>
              <div className="hud-chip">
                <strong>Participants</strong>
                <span>{formatParticipant(bundle, 'A')} vs {formatParticipant(bundle, 'B')}</span>
              </div>
              <div className="hud-chip">
                <strong>Frames</strong>
                <span>{viewerTimeline?.length ?? 0}</span>
              </div>
            </div>
            <div className="battle-hint" aria-live="polite">
              Space: Play/Pause · F: Fullscreen · Esc: Exit Fullscreen
            </div>
          </div>
        </div>
      </div>

      <BattleResultOverlay
        open={showResult && Boolean(outcome)}
        status={outcome === 'enemy' ? 'defeat' : outcome === 'player' ? 'victory' : 'draw'}
        winnerLabel={winnerLabel}
        matchId={displayMatchId}
        summaryLines={summaryLines}
        onAfterAction={handleAfterAction}
        showAfterAction={!isDemo}
        onBack={handleBack}
        onReplay={handleReplay}
        backLabel={backLabel}
      />
    </div>
  );
};

export default BattleTheater;
