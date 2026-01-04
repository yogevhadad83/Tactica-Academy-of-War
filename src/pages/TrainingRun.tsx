import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BoardSetupPanel from '../components/BoardSetupPanel';
import PrebattleLayout from '../components/PrebattleLayout';
import { useAuth } from '../context/AuthContext';
import { usePlayerContext } from '../context/PlayerContext';
import { trainingDrills } from '../data/trainingDrills';
import { BOARD_COLS, BOARD_SIZE } from '../engine/battleEngine';
import { runTrainingBattle } from '../engine/runTrainingBattle';
import type { PlacedUnit } from '../types';
import { addGuestCredits, hasCompleted, markCompleted } from '../utils/trainingProgress';
import { validatePlacementsInBounds } from '../utils/validatePlacementsInBounds';
import { supabase } from '../lib/supabaseClient';

type ValidationResult = { ok: true } | { ok: false; message: string };

const cloneUnit = (unit: PlacedUnit): PlacedUnit => ({
  ...unit,
  position: { ...unit.position },
  currentHp: unit.currentHp ?? unit.hp,
  currentShield: unit.currentShield ?? unit.shield ?? 0,
});

const TrainingRun = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { player, setPlayerCredits, refresh: refreshPlayer } = usePlayerContext();
  const module = trainingDrills.find((m) => m.id === id) ?? null;
  const userId = user?.id ?? null;

  const [playerUnits, setPlayerUnits] = useState<PlacedUnit[]>([]);
  const [enemyUnits, setEnemyUnits] = useState<PlacedUnit[]>([]);
  const [repositionsRemaining, setRepositionsRemaining] = useState<number>(0);
  const [behaviorChangesRemaining, setBehaviorChangesRemaining] = useState<number>(0);
  const [configError, setConfigError] = useState<string | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [rewardGranted, setRewardGranted] = useState<number>(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [startingTeam, setStartingTeam] = useState<'player' | 'enemy'>('player');

  const alreadyCompleted = useMemo(() => (module ? hasCompleted(module.id, userId) : false), [module, userId]);

  const resetFromModule = useCallback(() => {
    if (!module) return;
    setPlayerUnits(module.playerStartBoard.map(cloneUnit));
    setEnemyUnits(module.opponentStartBoard.map(cloneUnit));
    setRepositionsRemaining(module.allowedEdits.maxRepositions);
    setBehaviorChangesRemaining(module.allowedEdits.maxBehaviorChanges);
    setConfigError(null);
    setRewardError(null);
    setRewardGranted(0);
    setNotice(null);
    setStartingTeam(module.playerGoesFirst ? 'player' : 'enemy');
  }, [module]);

  useEffect(() => {
    resetFromModule();
  }, [resetFromModule]);

  const playArea = module?.playArea ?? null;

  const validateSetup = useCallback((): ValidationResult => {
    if (!module) return { ok: false, message: 'Drill not found.' };

    const combined = [...playerUnits, ...enemyUnits];
    const bounds = validatePlacementsInBounds(combined, BOARD_COLS, BOARD_SIZE);
    if (!bounds.ok) {
      const { unitId, col, row } = bounds.error;
      return { ok: false, message: `Invalid drill config: unit out of bounds: ${unitId} at (${col},${row})` };
    }

    if (playArea) {
      const offender = combined.find((u) => {
        const inCols = u.position.col >= playArea.colStart && u.position.col < playArea.colStart + playArea.cols;
        const inEnemyRows = u.position.row >= playArea.enemyRowStart && u.position.row < playArea.enemyRowStart + playArea.rowsPerSide;
        const inPlayerRows = u.position.row >= playArea.playerRowStart && u.position.row < playArea.playerRowStart + playArea.rowsPerSide;
        return !(inCols && (inEnemyRows || inPlayerRows));
      });

      if (offender) {
        const idLabel = offender.instanceId ?? offender.id;
        return { ok: false, message: `Invalid drill config: unit outside play area: ${idLabel} at (${offender.position.col},${offender.position.row})` };
      }
    }

    return { ok: true };
  }, [enemyUnits, module, playArea, playerUnits]);

  const handleBoardChange = useCallback((nextPlayer: PlacedUnit[], nextEnemy: PlacedUnit[]) => {
    setPlayerUnits(nextPlayer);
    setEnemyUnits(nextEnemy);
    setConfigError(null);
  }, []);

  const applyReward = useCallback(async (winner: 'player' | 'enemy' | 'draw') => {
    if (!module) return;
    if (winner !== 'player') return;
    if (alreadyCompleted) {
      setRewardGranted(0);
      return;
    }

    const reward = module.rewardCredits;
    if (!reward || reward <= 0) {
      markCompleted(module.id, userId);
      setRewardGranted(0);
      return;
    }

    try {
      if (!userId) {
        addGuestCredits(reward);
        markCompleted(module.id, null);
      } else {
        const currentCredits = player?.current_credits ?? 0;
        const nextCredits = currentCredits + reward;
        const { error } = await supabase
          .from('players')
          .update({ current_credits: nextCredits })
          .eq('id', userId);

        if (error) {
          throw error;
        }

        setPlayerCredits(nextCredits);
        refreshPlayer();
        markCompleted(module.id, userId);
      }

      setRewardGranted(reward);
      setRewardError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply rewards';
      setRewardError(message);
      setRewardGranted(0);
    }
  }, [alreadyCompleted, module, player?.current_credits, refreshPlayer, setPlayerCredits, userId]);

  const handleStartBattle = useCallback(async () => {
    if (!module) return;
    const validation = validateSetup();
    if (!validation.ok) {
      setConfigError(validation.message);
      return;
    }

    setNotice('Launching training battle...');

    const result = runTrainingBattle({
      playerUnits,
      enemyUnits,
      playerGoesFirst: module.playerGoesFirst,
      mode: 'training',
      playArea: module.playArea ?? null,
    });

    await applyReward(result.winner === 'draw' ? 'draw' : result.winner);

    const matchId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `training-${Date.now()}`;
    const winnerSide = result.winner === 'player' ? 'A' : result.winner === 'enemy' ? 'B' : 'draw';

    navigate(`/battle/${matchId}`, {
      state: {
        mode: 'training',
        matchId,
        timelineA: result.timeline,
        timelineB: null,
        winnerSide,
        moduleId: module.id,
        moduleTitle: module.title,
        exitTo: '/training',
        playArea: module.playArea ?? null,
      },
    });
  }, [applyReward, enemyUnits, module, navigate, playerUnits, validateSetup]);

  if (!module) {
    return (
      <div className="prebattle-shell">
        <div className="prebattle-banner">
          <p className="banner-kicker">Training</p>
          <h1>Drill not found</h1>
        </div>
        <div className="prebattle-footer">
          <Link className="prebattle-btn" to="/training">
            Back to Training
          </Link>
        </div>
      </div>
    );
  }

  const metaCards = (
    <>
      <div className="meta-card">
        <p className="meta-label">Drill</p>
        <h3>{module.title}</h3>
        <p className="meta-subtext">Reward: +{module.rewardCredits} credits</p>
      </div>
      <div className="meta-card">
        <p className="meta-label">Status</p>
        <h3>{alreadyCompleted ? 'Completed' : 'Ready'}</h3>
        <p className="meta-subtext">First turn: {startingTeam === 'player' ? 'Player' : 'Opponent'}</p>
      </div>
    </>
  );

  const controlPanel = (
    <>
      <div className="control-card-header">
        <p className="board-label">Instructor Brief</p>
        <h2>{module.title}</h2>
        <p className="board-status">{module.description}</p>
      </div>

      <div className="prebattle-move-summary">
        <h3>One-time Reward</h3>
        <p>{alreadyCompleted ? 'Already claimed' : `+${module.rewardCredits} credits on first win`}</p>
      </div>

      <div className="prebattle-status-pills">
        <span className="prebattle-status-pill active">
          Move budget: {Math.max(0, repositionsRemaining)} / {module.allowedEdits.maxRepositions}
        </span>
        <span className="prebattle-status-pill muted">
          Behaviors: {module.allowedEdits.maxBehaviorChanges > 0 ? module.allowedEdits.maxBehaviorChanges : 'disabled'}
        </span>
      </div>

      {playArea && (
        <div className="prebattle-move-summary">
          <h3>Active Area</h3>
          <p>
            {playArea.cols}x{playArea.rowsPerSide} per side (cols {playArea.colStart + 1}-{playArea.colStart + playArea.cols})
          </p>
        </div>
      )}

      {configError && <p className="prebattle-control-error">{configError}</p>}
      {rewardError && <p className="prebattle-control-error">{rewardError}</p>}
      {rewardGranted > 0 && (
        <div className="prebattle-notice" role="status">
          Reward granted: +{rewardGranted} credits
        </div>
      )}
    </>
  );

  const footer = (
    <>
      <Link className="prebattle-btn ghost" to="/training">
        Back to Training
      </Link>
      <button type="button" className="prebattle-btn" onClick={resetFromModule}>
        Reset Drill
      </button>
      <button
        type="button"
        className="prebattle-btn accent"
        onClick={handleStartBattle}
      >
        {alreadyCompleted ? 'Replay Battle' : 'Start Battle'}
      </button>
    </>
  );

  return (
    <PrebattleLayout
      banner={{
        kicker: 'Pre-Battle Directive',
        title: 'Training Drill',
        subtitle: module.title
      }}
      meta={metaCards}
      alerts={notice ? <div className="prebattle-notice">{notice}</div> : null}
      stage={(
        <BoardSetupPanel
          mode="training"
          trainingBoard="player"
          playerUnits={playerUnits}
          enemyUnits={enemyUnits}
          onChange={handleBoardChange}
          allowedEdits={{ repositions: repositionsRemaining, behaviorChanges: behaviorChangesRemaining }}
          locks={{ restrictToActiveArea: Boolean(playArea), restrictToOwnZone: true, disallowAddRemove: true, enemyLocked: true }}
          activeArea={playArea ?? undefined}
          onRepositionUsed={() => setRepositionsRemaining((prev) => Math.max(0, prev - 1))}
          onBehaviorChangeUsed={() => setBehaviorChangesRemaining((prev) => Math.max(0, prev - 1))}
          canEditBehavior={(unit) => {
            if (!module) return false;
            const allowedIds = new Set(module.allowedEdits.behaviorChangeUnitIds.map((unitId) => unitId.toLowerCase()));
            return unit.team === 'player' && allowedIds.has(unit.id.toLowerCase());
          }}
        />
      )}
      control={controlPanel}
      footer={footer}
    />
  );
};

export default TrainingRun;
