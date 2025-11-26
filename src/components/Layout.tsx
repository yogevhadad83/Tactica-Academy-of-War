import { Outlet, Link, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { useUser } from '../context/UserContext';
import './Layout.css';

const Layout = () => {
  const location = useLocation();
  const { currentUser, logout, users, switchUser } = useUser();

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

  const armyStrength = useMemo(() => {
    if (!currentUser) return 0;
    return currentUser.army.reduce((sum, unit) => sum + unit.damage + unit.defense, 0);
  }, [currentUser]);

  const armySupply = useMemo(() => {
    if (!currentUser) return 0;
    return currentUser.army.reduce((sum, unit) => sum + unit.cost, 0);
  }, [currentUser]);

  return (
    <div className="layout">
      <nav className="navbar">
        <Link to="/" className="nav-brand">
          ⚔️ ARMORIA
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
          {currentUser ? (
            <>
              <div className="user-pill">
                <div>
                  <div className="user-name">{currentUser.username}</div>
                  <div className="user-stats">
                    <span>⭐ Lvl {currentUser.level}</span>
                    <span>💰 {currentUser.gold}</span>
                    <span>⚔️ {armyStrength}</span>
                    <span>🪙 {armySupply}/650</span>
                  </div>
                </div>
                {users.length > 1 && (
                  <select
                    aria-label="Switch user"
                    value={currentUser.id}
                    onChange={(event) => switchUser(event.target.value)}
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" className="logout-btn" onClick={logout}>
                  Logout
                </button>
              </div>
            </>
          ) : (
            <div className="auth-links">
              <Link to="/login" className="nav-link ghost">
                Login
              </Link>
              <Link to="/register" className="nav-link solid">
                Register
              </Link>
            </div>
          )}
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="footer">
        <p>Armoria - Browser-based PvP Strategy Game</p>
        <p className="footer-note">Built with React + TypeScript</p>
      </footer>
    </div>
  );
};

export default Layout;
