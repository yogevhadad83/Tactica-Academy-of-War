import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { units } from '../data/units';
import { useUser } from '../context/UserContext';
import './StrategyEditor.css';

const conditionOptions = [
  'HP below 40%',
  'Enemy in range',
  'Ally injured nearby',
  'Path blocked',
  'Enemy type: Dragon'
];

const actionOptions = [
  'Move forward',
  'Shift sideways',
  'Retreat 2 tiles',
  'Swap with ally',
  'Hold position',
  'Attack priority target'
];

const StrategyEditor = () => {
  const { currentUser, addStrategyRule, removeStrategyRule } = useUser();
  const [unitId, setUnitId] = useState(units[0]?.id ?? 'knight');
  const [condition, setCondition] = useState(conditionOptions[0]);
  const [action, setAction] = useState(actionOptions[0]);
  const [message, setMessage] = useState('');

  const strategyBook = currentUser?.strategies ?? {};
  const rulesByUnit = useMemo(() => {
    return units.map((unit) => ({
      unit,
      rules: strategyBook[unit.id] ?? []
    }));
  }, [strategyBook]);

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) {
      setMessage('Login to save strategies.');
      return;
    }
    addStrategyRule(unitId, {
      id: crypto.randomUUID(),
      unitId,
      condition,
      action
    });
    setMessage('Rule saved to your strategy book.');
  };

  return (
    <div className="strategy-editor-container">
      <div className="strategy-editor-header">
        <h1>📋 Strategy Editor</h1>
        <p className="header-subtitle">
          Define behavior rules for your units (Coming Soon)
        </p>
      </div>

      <div className="strategy-content">
        <section className="coming-soon-panel">
          <div className="placeholder-icon">🚧</div>
          <h2>Under Construction</h2>
          <p>
            The editor will let you chain IF conditions with THEN actions to choreograph how
            Knights, Archers, Horsemen, Beasts, and Dragons react each tick.
          </p>

          <div className="unit-showcase">
            {['Knight', 'Archer', 'Horseman', 'Beast', 'Dragon'].map((label) => (
              <span key={label} className="unit-chip">{label}</span>
            ))}
          </div>

          <div className="feature-preview">
            <h3>Planned Features</h3>
            <ul>
              <li>Drag IF blocks such as HP % or Path Blocked.</li>
              <li>Stack THEN actions like Shift Sideways or Attack Priority.</li>
              <li>Assign rule bundles to specific unit squads.</li>
            </ul>
          </div>
        </section>

        <section className="rule-builder-panel">
          <div className="rule-builder-header">
            <h3>Prototype Rule Builder</h3>
            <p>Save placeholder rules per unit to test upcoming automation.</p>
          </div>
          <form className="rule-form" onSubmit={handleSave}>
            <label>
              Unit
              <select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              IF Condition
              <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                {conditionOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              THEN Action
              <select value={action} onChange={(event) => setAction(event.target.value)}>
                {actionOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            {message && <p className="rule-message">{message}</p>}
            <button type="submit" className="save-rule-btn">
              Save Rule
            </button>
          </form>

          <div className="example-rules">
            <h3>Armoria Examples</h3>
            <div className="rule-card">
              <div className="rule-header">
                <span className="rule-name">Knight Shield Wall</span>
                <span className="rule-tag">Formation</span>
              </div>
              <div className="rule-description">
                IF HP below 40% AND ally injured nearby THEN hold position and guard Archer.
              </div>
            </div>

            <div className="rule-card">
              <div className="rule-header">
                <span className="rule-name">Archer Volley</span>
                <span className="rule-tag">Focus</span>
              </div>
              <div className="rule-description">
                IF enemy type: Dragon THEN attack priority target before moving.
              </div>
            </div>

            <div className="rule-card">
              <div className="rule-header">
                <span className="rule-name">Dragon Sweep</span>
                <span className="rule-tag">Aerial</span>
              </div>
              <div className="rule-description">
                IF path blocked THEN move sideways, breathe flame, and retreat 2 tiles.
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="saved-rules-panel">
        <h2>Your Strategy Book</h2>
        {!currentUser && <p className="rule-message">Login to create and persist strategy rules.</p>}
        {currentUser &&
          rulesByUnit.map(({ unit, rules }) => (
            <div key={unit.id} className="saved-rules-group">
              <div className="group-title">
                <span>{unit.icon} {unit.name}</span>
                <span>{rules.length} rule{rules.length === 1 ? '' : 's'}</span>
              </div>
              {rules.length === 0 ? (
                <p className="rule-message">No rules yet.</p>
              ) : (
                <ul>
                  {rules.map((rule) => (
                    <li key={rule.id}>
                      <div>
                        <strong>IF</strong> {rule.condition} <strong>THEN</strong> {rule.action}
                      </div>
                      <button type="button" onClick={() => removeStrategyRule(unit.id, rule.id)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
      </section>
    </div>
  );
};

export default StrategyEditor;
