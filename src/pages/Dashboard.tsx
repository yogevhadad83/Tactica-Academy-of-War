import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import { usePlayerContext } from '../context/PlayerContext';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { currentUser } = useUser();
  const { player, loading, error } = usePlayerContext();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  return (
    <div className="dashboard-page">
      <h1>Commander Dashboard</h1>
      <p>Signed in as {user.email}</p>

      {loading && <p>Loading player data…</p>}
      {error && <p className="auth-error">{error.message}</p>}

      {player && !loading && (
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h3>Display Name</h3>
            <p>{player.display_name ?? 'Unknown'}</p>
          </div>
          <div className="dashboard-card">
            <h3>Credits</h3>
            <p>💰 {player.current_credits}</p>
          </div>
        </div>
      )}

      {currentUser && (
        <div className="dashboard-card" style={{ marginTop: '16px' }}>
          <h3>Local Profile</h3>
          <p>Army size: {currentUser.army.length}</p>
        </div>
      )}

      <button type="button" onClick={handleSignOut} style={{ marginTop: '16px' }}>
        Sign out
      </button>
    </div>
  );
};

export default Dashboard;
