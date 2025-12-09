import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import './Layout.css';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { currentUser } = useUser();

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="layout">
      <nav className="navbar">
        <Link to="/" className="nav-brand">
          ⚔️ Tactica: Academy of War
        </Link>
        <div className="nav-links">
          <Link to="/" className={`nav-link ${isActive('/')}`}>
            🏠 Home
          </Link>
          <Link to="/army-builder" className={`nav-link ${isActive('/army-builder')}`}>
            🏰 Army Builder
          </Link>
          <Link to="/strategy" className={`nav-link ${isActive('/strategy')}`}>
            📋 Strategy
          </Link>
          <Link to="/board" className={`nav-link ${isActive('/board')}`}>
            🎮 Board
          </Link>
        </div>
        <div className="nav-user-area">
          {user ? (
            <>
              <div className="user-pill">
                <div className="user-name">{currentUser?.username ?? user.email}</div>
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
