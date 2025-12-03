import { Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import './Home.css';

const Home = () => {
  const { currentUser } = useUser();

  const quickLinks = (
    <div className="quick-links">
      <Link to="/army-builder" className="quick-link-card">
        <span>⚔️ Build Army</span>
        <p>Spend supply to assemble elite squads.</p>
      </Link>
      <Link to="/strategy" className="quick-link-card">
        <span>🧠 Strategy</span>
        <p>Author IF → THEN behaviors per unit.</p>
      </Link>
      <Link to="/board" className="quick-link-card">
        <span>🎯 Board</span>
        <p>Place units on the 12×12 battlefield.</p>
      </Link>
    </div>
  );

  return (
    <div className="home-container">
      <div className="hero-section">
        <h1 className="game-title">⚔️ Tactica: Academy of War ⚔️</h1>
        <p className="game-subtitle">
          Draft Knights, Horsemen, Archers, Beasts, and Dragons, assign battlefield instincts,
          and watch them clash autonomously on Tactica&apos;s tactical grid.
        </p>
        {!currentUser && (
          <div className="hero-cta">
            <Link to="/register" className="hero-btn primary">Register</Link>
            <Link to="/login" className="hero-btn ghost">Login</Link>
          </div>
        )}
      </div>

      {currentUser ? (
        <section className="commander-summary">
          <h2>Welcome back, {currentUser.username}</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <span>Gold</span>
              <strong>{currentUser.gold}</strong>
            </div>
            <div className="summary-card">
              <span>Level</span>
              <strong>{currentUser.level}</strong>
            </div>
            <div className="summary-card">
              <span>Army Size</span>
              <strong>{currentUser.army.length} / 20</strong>
            </div>
          </div>
          {quickLinks}
        </section>
      ) : (
        <section className="guest-cta">
          <h2>Ready to command?</h2>
          <p>Create a Tactica profile to unlock army building and strategic tools.</p>
          <div className="guest-actions">
            <Link to="/register" className="hero-btn primary">Create Account</Link>
            <Link to="/login" className="hero-btn ghost">Login</Link>
          </div>
        </section>
      )}

      <div className="menu-grid">
        <Link to="/army-builder" className="menu-card">
          <div className="menu-icon">🏰</div>
          <h2>Army Builder</h2>
          <p>Assemble your front line of Knights, Horsemen, Archers, Beasts, and Dragons.</p>
        </Link>

        <Link to="/strategy" className="menu-card">
          <div className="menu-icon">📋</div>
          <h2>Strategy Editor</h2>
          <p>Define battle instincts and contingency plans.</p>
        </Link>

        <Link to="/board" className="menu-card">
          <div className="menu-icon">🎮</div>
          <h2>Battle Board</h2>
          <p>Preview placements on the 12×12 battlefield.</p>
        </Link>
      </div>

      <div className="info-section">
        <h3>How to Play</h3>
        <ol>
          <li><strong>Build your army:</strong> Spend your supply budget across Knights, Horsemen, Archers, Beasts, and Dragons.</li>
          <li><strong>Set behaviors:</strong> Craft IF/THEN rules that tell units how to react mid-fight.</li>
          <li><strong>Watch auto-battles:</strong> Drop your formation on the board and let Tactica resolve the clash.</li>
        </ol>
      </div>
    </div>
  );
};

export default Home;
