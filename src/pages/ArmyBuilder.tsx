import { useState } from 'react';
import { mockUnits } from '../data/mockUnits';
import type { Unit } from '../types';
import './ArmyBuilder.css';

const ArmyBuilder = () => {
  const [selectedUnits, setSelectedUnits] = useState<Unit[]>([]);
  const maxBudget = 500;

  const totalCost = selectedUnits.reduce((sum, unit) => sum + unit.cost, 0);
  const remainingBudget = maxBudget - totalCost;

  const addUnit = (unit: Unit) => {
    if (totalCost + unit.cost <= maxBudget) {
      const uniqueId = `${unit.id}-${crypto.randomUUID()}`;
      setSelectedUnits([...selectedUnits, { ...unit, id: uniqueId }]);
    }
  };

  const removeUnit = (index: number) => {
    setSelectedUnits(selectedUnits.filter((_, i) => i !== index));
  };

  const clearArmy = () => {
    setSelectedUnits([]);
  };

  return (
    <div className="army-builder-container">
      <div className="army-builder-header">
        <h1>🏰 Army Builder</h1>
        <div className="budget-info">
          <span className="budget-label">Budget:</span>
          <span className="budget-current">{totalCost}</span>
          <span className="budget-separator">/</span>
          <span className="budget-max">{maxBudget}</span>
          <span className={`budget-remaining ${remainingBudget < 50 ? 'low' : ''}`}>
            (Remaining: {remainingBudget})
          </span>
        </div>
      </div>

      <div className="army-builder-content">
        {/* Available Units */}
        <div className="available-units-section">
          <h2>Available Units</h2>
          <div className="units-grid">
            {mockUnits.map((unit) => (
              <div key={unit.id} className="unit-card">
                <div className="unit-icon">{unit.icon}</div>
                <h3>{unit.name}</h3>
                <div className="unit-type">{unit.type}</div>
                <div className="unit-stats">
                  <div className="stat">
                    <span className="stat-label">⚔️</span>
                    <span>{unit.attack}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">🛡️</span>
                    <span>{unit.defense}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">❤️</span>
                    <span>{unit.health}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">⚡</span>
                    <span>{unit.speed}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">🎯</span>
                    <span>{unit.range}</span>
                  </div>
                </div>
                <div className="unit-cost">Cost: {unit.cost} 💰</div>
                <button
                  className="add-unit-btn"
                  onClick={() => addUnit(unit)}
                  disabled={remainingBudget < unit.cost}
                >
                  Add to Army
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Army */}
        <div className="selected-army-section">
          <div className="selected-army-header">
            <h2>Your Army ({selectedUnits.length} units)</h2>
            {selectedUnits.length > 0 && (
              <button className="clear-army-btn" onClick={clearArmy}>
                Clear All
              </button>
            )}
          </div>
          
          {selectedUnits.length === 0 ? (
            <div className="empty-army">
              <p>No units selected yet.</p>
              <p>Click "Add to Army" to build your force!</p>
            </div>
          ) : (
            <div className="selected-units-list">
              {selectedUnits.map((unit, index) => (
                <div key={unit.id} className="selected-unit-item">
                  <span className="selected-unit-icon">{unit.icon}</span>
                  <span className="selected-unit-name">{unit.name}</span>
                  <span className="selected-unit-cost">{unit.cost} 💰</span>
                  <button
                    className="remove-unit-btn"
                    onClick={() => removeUnit(index)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArmyBuilder;
