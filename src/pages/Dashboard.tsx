import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';

interface PlayerRow {
  id: string;
  display_name: string | null;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { currentUser } = useUser();
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlayer = async () => {
      if (!user) return;
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('players')
        .select('*')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setPlayer(data as PlayerRow);
        setError(null);
      }
      setLoading(false);
    };

    loadPlayer();
  }, [user]);

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
      {error && <p className="auth-error">{error}</p>}

      {player && !loading && (
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h3>Display Name</h3>
            <p>{player.display_name ?? 'Unknown'}</p>
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
