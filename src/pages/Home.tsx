import { Link } from 'react-router-dom';
import './Home.css';

const Home = () => {
  return (
    <div className="home-container">
      <div className="hero-section">
        <h1 className="game-title">⚔️ ARMORIA ⚔️</h1>
        <p className="game-subtitle">
          A browser-based PvP strategy game where players assemble an army,
          set behavior rules, and send their forces into automatic battles
          on a 12×12 board.
        </p>
      </div>

      <div className="menu-grid">
        <Link to="/army-builder" className="menu-card">
          <div className="menu-icon">🏰</div>
          <h2>Army Builder</h2>
          <p>Assemble your army from various unit types</p>
        </Link>

        <Link to="/strategy" className="menu-card">
          <div className="menu-icon">📋</div>
          <h2>Strategy Editor</h2>
          <p>Set behavior rules for your units</p>
        </Link>

        <Link to="/board" className="menu-card">
          <div className="menu-icon">🎮</div>
          <h2>Battle Board</h2>
          <p>View the 12×12 battlefield</p>
        </Link>
      </div>

      <div className="info-section">
        <h3>How to Play</h3>
        <ol>
          <li><strong>Build Your Army:</strong> Choose from Warriors, Archers, Mages, and Tanks</li>
          <li><strong>Set Strategies:</strong> Define behavior rules for your units (coming soon)</li>
          <li><strong>Enter Battle:</strong> Watch your army fight automatically on the board</li>
        </ol>
      </div>
    </div>
  );
};

export default Home;
