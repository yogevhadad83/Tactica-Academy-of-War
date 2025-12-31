import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { trainingDrills } from '../data/trainingDrills';
import { getTrainingState } from '../utils/trainingProgress';
import './Training.css';

const Training = () => {
  const { user } = useAuth();
  const userIdOrNull = user?.id ?? null;

  const trainingState = useMemo(() => getTrainingState(userIdOrNull), [userIdOrNull]);
  const completed = new Set(trainingState.completedModuleIds);

  const nextModule = trainingDrills.find((module) => !completed.has(module.id)) ?? null;
  const allComplete = nextModule === null;

  return (
    <div className="training-page">
      {!user && (
        <div className="training-banner" role="status">
          <div className="training-banner-title">Login to save progress</div>
          <div className="training-banner-subtitle">Guest credits: {trainingState.guestCredits}</div>
        </div>
      )}

      <section className="training-continue">
        <div className="training-card">
          <div className="training-card-header">
            <h1 className="training-title">Training</h1>
            <div className="training-subtitle">Academy drills (MVP)</div>
          </div>

          {allComplete ? (
            <div className="training-continue-row">
              <div>
                <div className="training-continue-title">All training complete</div>
                <div className="training-continue-desc">Replay drills anytime to practice.</div>
              </div>
              <Link className="training-btn" to={`/training/${trainingDrills[0]?.id ?? ''}`}>
                Replay a drill
              </Link>
            </div>
          ) : (
            <div className="training-continue-row">
              <div>
                <div className="training-continue-title">Continue Training</div>
                <div className="training-continue-desc">
                  Next: <strong>{nextModule.title}</strong> (+{nextModule.rewardCredits} one-time)
                </div>
              </div>
              <Link className="training-btn primary" to={`/training/${nextModule.id}`}>
                Start
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="training-list" aria-label="Training modules">
        {trainingDrills.map((module) => {
          const isCompleted = completed.has(module.id);
          return (
            <div key={module.id} className="training-module">
              <div className="training-module-top">
                <div className="training-module-title">
                  {module.title}
                  {isCompleted && <span className="training-check" aria-label="Completed">✓</span>}
                </div>
                <div className="training-module-reward">+{module.rewardCredits} credits</div>
              </div>

              <div className="training-module-desc">{module.description}</div>

              <div className="training-module-actions">
                <Link className={`training-btn ${isCompleted ? '' : 'primary'}`} to={`/training/${module.id}`}>
                  {isCompleted ? 'Replay' : 'Start'}
                </Link>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
};

export default Training;
