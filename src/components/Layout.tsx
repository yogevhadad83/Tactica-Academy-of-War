import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import { usePlayerContext } from '../context/PlayerContext';
import { useAudio } from '../context/AudioContext';
import './Layout.css';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { currentUser } = useUser();
  const { player } = usePlayerContext();
  const { isMuted, toggleMute } = useAudio();

  const isActive = (path: string) => {
    // Academy is active for both /academy and / routes
    if (path === '/academy' && (location.pathname === '/academy' || location.pathname === '/')) {
      return 'active';
    }
    return location.pathname === path ? 'active' : '';
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="layout">
      <nav className="navbar">
        <Link to="/academy" className="nav-brand">
          ⚔️ Tactica: Academy of War
        </Link>
        <div className="nav-links">
          <Link to="/academy" className={`nav-link ${isActive('/academy')}`}>
            🎓 Academy
          </Link>
          <Link to="/training" className={`nav-link ${isActive('/training')}`}>
            📚 Training
          </Link>
          <Link to="/quartermaster" className={`nav-link ${isActive('/quartermaster')}`}>
            🏰 Quartermaster
          </Link>
          <Link to="/war-room" className={`nav-link ${isActive('/war-room')}`}>
            ⚔️ War Room
          </Link>
        </div>
        <div className="nav-user-area">
          <button 
            type="button" 
            className="mute-btn" 
            onClick={toggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          {user ? (
            <>
              <div className="user-pill">
                <div className="user-name">
                  {player?.display_name || currentUser?.username || user.email}
                  {player?.current_credits !== undefined && ` (💰 ${player.current_credits})`}
                </div>
                <button type="button" className="logout-btn" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </>
          ) : (
            <div className="auth-links">
              <Link to="/login" className="nav-link ghost">
                Login
              </Link>
              <Link to="/signup" className="nav-link solid">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="footer">
        <p>Tactica: Academy of War - Browser-based PvP Strategy Game</p>
        <p className="footer-note">Built with React + TypeScript</p>
      </footer>
    </div>
  );
};

export default Layout;
