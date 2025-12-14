import type { PlacedUnit } from '../types';
import './UnitLogicPanel.css';

interface UnitLogicPanelProps {
  unit: PlacedUnit;
  onBehaviorSelect: (behavior: string, categoryKey?: string) => void;
  onClose: () => void;
}

// Parse behaviors into categories (e.g., "Target Preference: Weakest" -> category "Target Preference", option "Weakest")
const parseBehaviorCategories = (behaviors: string[]) => {
  const categories: Record<string, { options: Array<{ option: string; fullBehavior: string }>; selected?: string }> = {};
  
  behaviors.forEach((behavior) => {
    const colonIndex = behavior.indexOf(':');
    if (colonIndex > -1) {
      const category = behavior.substring(0, colonIndex).trim();
      const option = behavior.substring(colonIndex + 1).trim();
      
      if (!categories[category]) {
        categories[category] = { options: [] };
      }
      categories[category].options.push({ option, fullBehavior: behavior });
    }
  });
  
  return categories;
};

const UnitLogicPanel = ({ unit, onBehaviorSelect, onClose }: UnitLogicPanelProps) => {
  const hasLogic = unit.behaviorOptions && unit.behaviorOptions.length > 0;
  const categories = hasLogic ? parseBehaviorCategories(unit.behaviorOptions) : {};
  const hasMultipleCategories = Object.keys(categories).length > 1;
  
  // Set defaults for first-time selection
  const getDefaultsForUnit = () => {
    const defaults: string[] = [];
    Object.entries(categories).forEach(([_, catData]) => {
      if (catData.options.length > 0) {
        // Default to first option (or could be customized per unit)
        defaults.push((catData.options[0] as any).fullBehavior);
      }
    });
    return defaults;
  };
  
  const selectedBehaviors = unit.selectedBehaviors || getDefaultsForUnit();
  
  const getSelectedForCategory = (category: string) => {
    return selectedBehaviors.find(b => b.startsWith(category + ':'));
  };

  return (
    <div className="unit-logic-panel-overlay" onClick={onClose}>
      <div className="unit-logic-panel" onClick={(e) => e.stopPropagation()}>
        <div className="logic-panel-header">
          <div className="logic-panel-title">
            <span className="unit-icon-large">{unit.icon}</span>
            <div>
              <h2>{unit.name}</h2>
              <p className="logic-panel-subtitle">Instance {unit.instanceId.slice(0, 8)}</p>
            </div>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Close logic panel"
          >
            ✕
          </button>
        </div>

        <div className="logic-panel-content">
          {!hasLogic ? (
            <div className="no-logic-message">
              <p>This unit type has no configurable behaviors.</p>
              <p className="logic-description">
                {unit.name} will follow its default behavior patterns during battle.
              </p>
            </div>
          ) : (
            <>
              <div className="logic-description">
                {hasMultipleCategories ? (
                  <p>Configure {unit.name}'s tactics:</p>
                ) : (
                  <p>Select a behavior for this {unit.name}:</p>
                )}
              </div>
              
              {hasMultipleCategories ? (
                <div className="behavior-categories">
                  {Object.entries(categories).map(([categoryName, catData]) => {
                    const selected = getSelectedForCategory(categoryName);
                    return (
                      <div key={categoryName} className="category-section">
                        <h3 className="category-name">{categoryName}</h3>
                        <div className="category-options">
                          {(catData.options as any[]).map(({ option, fullBehavior }) => (
                            <button
                              key={fullBehavior}
                              type="button"
                              className={`behavior-option ${selected === fullBehavior ? 'selected' : ''}`}
                              onClick={() => onBehaviorSelect(fullBehavior, categoryName)}
                            >
                              <span className="behavior-name">{option}</span>
                              {selected === fullBehavior && <span className="behavior-indicator">✓</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="behavior-grid">
                  {unit.behaviorOptions.map((behavior) => {
                    const isSelected = selectedBehaviors.includes(behavior);
                    return (
                      <button
                        key={behavior}
                        type="button"
                        className={`behavior-option ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          onBehaviorSelect(behavior);
                        }}
                      >
                        <span className="behavior-name">{behavior}</span>
                        {isSelected && <span className="behavior-indicator">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              
              {selectedBehaviors.length > 0 && (
                <div className="selected-logic">
                  <strong>Configuration:</strong>
                  {selectedBehaviors.map((behavior, idx) => (
                    <div key={idx} className="selected-behavior">{behavior}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="logic-panel-info">
          <p className="info-text">
            These behaviors determine how your unit will act during battle.
            Each decision is deterministic and will be applied when combat begins.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UnitLogicPanel;
