import './StrategyEditor.css';

const StrategyEditor = () => {
  return (
    <div className="strategy-editor-container">
      <div className="strategy-editor-header">
        <h1>📋 Strategy Editor</h1>
        <p className="header-subtitle">
          Define behavior rules for your units (Coming Soon)
        </p>
      </div>

      <div className="strategy-content">
        <div className="placeholder-section">
          <div className="placeholder-icon">🚧</div>
          <h2>Under Construction</h2>
          <p>
            The Strategy Editor will allow you to create complex behavior rules
            for your units without any coding required.
          </p>

          <div className="feature-preview">
            <h3>Planned Features:</h3>
            <ul>
              <li>
                <strong>Visual Rule Builder:</strong> Create conditions and actions
                with drag-and-drop interface
              </li>
              <li>
                <strong>Unit Behaviors:</strong> Define how units should move, attack,
                and defend
              </li>
              <li>
                <strong>Conditional Logic:</strong> Set rules based on health, distance,
                enemy type, and more
              </li>
              <li>
                <strong>Formation Controls:</strong> Organize your units into strategic
                formations
              </li>
              <li>
                <strong>Priority System:</strong> Determine which rules take precedence
              </li>
              <li>
                <strong>Save & Load:</strong> Store your strategies for reuse
              </li>
            </ul>
          </div>

          <div className="example-rules">
            <h3>Example Rules:</h3>
            <div className="rule-card">
              <div className="rule-header">
                <span className="rule-name">Defensive Formation</span>
                <span className="rule-tag">Position</span>
              </div>
              <div className="rule-description">
                IF unit type is "Tank" THEN move to front line
              </div>
            </div>

            <div className="rule-card">
              <div className="rule-header">
                <span className="rule-name">Archer Support</span>
                <span className="rule-tag">Attack</span>
              </div>
              <div className="rule-description">
                IF unit type is "Archer" THEN attack nearest enemy from distance
              </div>
            </div>

            <div className="rule-card">
              <div className="rule-header">
                <span className="rule-name">Retreat Protocol</span>
                <span className="rule-tag">Survival</span>
              </div>
              <div className="rule-description">
                IF health &lt; 30% THEN retreat to nearest safe position
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StrategyEditor;
