import { Outlet, Link, useLocation } from 'react-router-dom';
import './Layout.css';

const Layout = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

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
