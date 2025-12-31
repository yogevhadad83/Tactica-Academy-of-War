import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayerContext } from '../context/PlayerContext';
import { getTrainingState } from '../utils/trainingProgress';
import { trainingDrills } from '../data/trainingDrills';
import { hasBattlePlan } from '../game/battlePlanStorage';
import ArchiveCard from '../components/ui/ArchiveCard';
import RuleDivider from '../components/ui/RuleDivider';
import StampButton from '../components/ui/StampButton';
import './Academy.css';

const Academy = () => {
  const { user } = useAuth();
  const { player } = usePlayerContext();
  const navigate = useNavigate();
  const userIdOrNull = user?.id ?? null;

  // Get training state
  const trainingState = useMemo(() => getTrainingState(userIdOrNull), [userIdOrNull]);
  const completed = new Set(trainingState.completedModuleIds);
  const nextModule = trainingDrills.find((module) => !completed.has(module.id)) ?? null;
  const allTrainingComplete = nextModule === null;

  // Check for battle plan
  const [planExists, setPlanExists] = useState(false);
  const [checkingPlan, setCheckingPlan] = useState(true);

  useEffect(() => {
    const checkPlan = async () => {
      setCheckingPlan(true);
      const exists = await hasBattlePlan(userIdOrNull);
      setPlanExists(exists);
      setCheckingPlan(false);
    };
    checkPlan();
  }, [userIdOrNull]);

  // Calculate credits
  const credits = user && player
    ? player.current_credits
    : trainingState.guestCredits;

  // Determine next orders (primary CTA)
  const getNextOrders = () => {
    if (!allTrainingComplete) {
      return {
        title: 'Continue Training',
        description: `Next: ${nextModule?.title || 'Unknown'} (+${nextModule?.rewardCredits || 0} credits)`,
        action: () => navigate('/training'),
        actionLabel: 'Report to Training'
      };
    }
    
    if (!planExists && !checkingPlan) {
      return {
        title: 'Enter War Room',
        description: 'Configure your unit placements and tactical logic',
        action: () => navigate('/war-room'),
        actionLabel: 'Enter War Room'
      };
    }
    
    return {
      title: 'Find Opponent',
      description: 'Your battle plan is ready. Queue for matchmaking.',
      action: () => navigate('/queue'),
      actionLabel: 'Find Opponent'
    };
  };

  const nextOrders = getNextOrders();

  // Rank system (static thresholds for MVP)
  const getRank = (currentCredits: number) => {
    if (currentCredits >= 1000) return { name: 'Lieutenant', next: 'Captain', cost: 2000 };
    if (currentCredits >= 500) return { name: 'Corporal', next: 'Lieutenant', cost: 1000 };
    if (currentCredits >= 100) return { name: 'Private First Class', next: 'Corporal', cost: 500 };
    return { name: 'Recruit', next: 'Private First Class', cost: 100 };
  };

  const rank = getRank(credits);

  return (
    <div className="academy-container">
      {/* Unauthenticated banner */}
      {!user && (
        <div className="academy-banner">
          <span>⚠️ Login to save your progress and unlock full features</span>
          <div className="academy-banner-actions">
            <Link to="/login" className="academy-banner-link">Login</Link>
            <Link to="/signup" className="academy-banner-link primary">Sign Up</Link>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="academy-header">
        <h1 className="academy-title">Academy Archives</h1>
        <p className="academy-subtitle">Cadet Training & Operations Command</p>
      </header>

      {/* Next Orders - Primary CTA */}
      <section className="academy-section">
        <h2 className="section-heading">Next Orders</h2>
        <ArchiveCard className="primary next-orders-card">
          <div className="next-orders-content">
            <div className="next-orders-text">
              <h3>{nextOrders.title}</h3>
              <p>{nextOrders.description}</p>
            </div>
            <StampButton onClick={nextOrders.action}>
              {nextOrders.actionLabel}
            </StampButton>
          </div>
        </ArchiveCard>
      </section>

      <RuleDivider />

      {/* Quick Actions */}
      <section className="academy-section">
        <h2 className="section-heading">Quick Actions</h2>
        <div className="quick-actions-grid">
          <ArchiveCard onClick={() => navigate('/training')}>
            <div className="quick-action-icon">📚</div>
            <h3>Training</h3>
            <p>Academy drills and tactical exercises</p>
          </ArchiveCard>

          <ArchiveCard onClick={() => navigate('/quartermaster')}>
            <div className="quick-action-icon">🏰</div>
            <h3>Quartermaster</h3>
            <p>Recruit and manage your roster</p>
          </ArchiveCard>

          <ArchiveCard onClick={() => navigate('/war-room')}>
            <div className="quick-action-icon">⚔️</div>
            <h3>War Room</h3>
            <p>Place units and configure logic</p>
          </ArchiveCard>

          <ArchiveCard onClick={() => navigate('/queue')}>
            <div className="quick-action-icon">🎯</div>
            <h3>Find Opponent</h3>
            <p>Queue for matchmaking</p>
          </ArchiveCard>
        </div>
      </section>

      <RuleDivider />

      {/* Cadet Status */}
      <section className="academy-section">
        <h2 className="section-heading">Cadet Status</h2>
        <div className="status-grid">
          <ArchiveCard className="status-card">
            <div className="status-label">Credits</div>
            <div className="status-value">💰 {credits}</div>
          </ArchiveCard>

          <ArchiveCard className="status-card">
            <div className="status-label">Rank</div>
            <div className="status-value">{rank.name}</div>
            <div className="status-detail">
              Next: {rank.next} ({rank.cost} credits)
            </div>
          </ArchiveCard>

          <ArchiveCard className="status-card">
            <div className="status-label">Training Progress</div>
            <div className="status-value">
              {completed.size} / {trainingDrills.length}
            </div>
            <div className="status-detail">modules completed</div>
          </ArchiveCard>

          <ArchiveCard className="status-card">
            <div className="status-label">Active Squad</div>
            <div className="status-value">—</div>
            <div className="status-detail">No deployment</div>
          </ArchiveCard>
        </div>
      </section>

      <RuleDivider />

      {/* Recent Reports - Placeholder */}
      <section className="academy-section">
        <h2 className="section-heading">Recent Reports</h2>
        <ArchiveCard>
          <div className="placeholder-content">
            <p>After-action reports will appear here once you complete battles.</p>
            <p className="placeholder-hint">Complete training to unlock matchmaking.</p>
          </div>
        </ArchiveCard>
      </section>
    </div>
  );
};

export default Academy;
