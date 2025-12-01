import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { units } from '../data/units';
import type { ArmyUnitInstance, Unit } from '../types';
import { useUser } from '../context/UserContext';
import './ArmyBuilder.css';
import UnitPreviewCanvas from '../components/UnitPreviewCanvas';

const maxBudget = 650;
const maxUnits = 20;

type BoardVector = { row: number; col: number };
type MovementBlueprint = {
  moves: BoardVector[];
  attacks: BoardVector[];
  description: {
    movement: string;
    attack: string;
  };
};

const BOARD_ROWS = 5;
const BOARD_COLS = 5;
const BOARD_ORIGIN = { row: BOARD_ROWS - 1, col: Math.floor(BOARD_COLS / 2) };

const MOVEMENT_BLUEPRINTS: Record<string, MovementBlueprint> = {
  default: {
    moves: [{ row: -1, col: 0 }],
    attacks: [{ row: -1, col: 0 }],
    description: {
      movement: 'Steps forward to pressure the frontline.',
      attack: 'Strikes the closest foe straight ahead.'
    }
  },
  knight: {
    moves: [{ row: -1, col: 0 }],
    attacks: [{ row: -1, col: 0 }],
    description: {
      movement: 'Knights advance one tile to engage quickly.',
      attack: 'Blade reaches the immediate tile in front.'
    }
  },
  beast: {
    moves: [
      { row: -1, col: 0 },
      { row: -1, col: -1 },
      { row: -1, col: 1 }
    ],
    attacks: [{ row: -1, col: 0 }],
    description: {
      movement: 'Beasts lumber forward and can lean into flanks.',
      attack: 'Crushing blow lands on the path directly ahead.'
    }
  },
  archer: {
    moves: [{ row: -1, col: 0 }],
    attacks: [
      { row: -1, col: 0 },
      { row: -2, col: 0 },
      { row: -3, col: 0 },
      { row: -4, col: 0 }
    ],
    description: {
      movement: 'Archers step forward to secure a firing lane.',
      attack: 'Arrows arc across every tile in front within range.'
    }
  }
};

const translateVectors = (vectors: BoardVector[]) =>
  vectors
    .map((vec) => ({
      row: BOARD_ORIGIN.row + vec.row,
      col: BOARD_ORIGIN.col + vec.col
    }))
    .filter((pos) => pos.row >= 0 && pos.row < BOARD_ROWS && pos.col >= 0 && pos.col < BOARD_COLS);

const boardKey = (pos: { row: number; col: number }) => `${pos.row}-${pos.col}`;

const MiniBoard = ({ unit }: { unit: Unit | null }) => {
  const blueprint = unit ? MOVEMENT_BLUEPRINTS[unit.id] ?? MOVEMENT_BLUEPRINTS.default : MOVEMENT_BLUEPRINTS.default;
  const movePositions = translateVectors(blueprint.moves);
  const attackPositions = translateVectors(blueprint.attacks);
  const originKey = boardKey(BOARD_ORIGIN);
  const moveKeys = new Set(movePositions.map(boardKey));
  const attackKeys = new Set(attackPositions.map(boardKey));

  const cells = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const key = boardKey({ row, col });
      const isOrigin = key === originKey;
      const canMove = moveKeys.has(key);
      const canAttack = attackKeys.has(key);
      const cellClass = [
        'mini-board__cell',
        (row + col) % 2 === 0 ? 'mini-board__cell--light' : 'mini-board__cell--dark',
        isOrigin ? 'mini-board__cell--origin' : '',
        canMove ? 'mini-board__cell--move' : '',
        canAttack ? 'mini-board__cell--attack' : '',
        canMove && canAttack ? 'mini-board__cell--focus' : ''
      ]
        .filter(Boolean)
        .join(' ');

      cells.push(
        <div key={key} className={cellClass}>
          {isOrigin ? '●' : ''}
        </div>
      );
    }
  }

  return (
    <>
      <div className="mini-board" aria-label="Unit movement and attack preview">
        {cells}
      </div>
      <div className="mini-board__legend">
        <span className="mini-board__legend-item">
          <span className="mini-board__legend-dot mini-board__legend-dot--move" /> Move arc
        </span>
        <span className="mini-board__legend-item">
          <span className="mini-board__legend-dot mini-board__legend-dot--attack" /> Attack reach
        </span>
        <span className="mini-board__legend-item">
          <span className="mini-board__legend-dot mini-board__legend-dot--origin" /> Current unit
        </span>
      </div>
      <div className="mini-board__note">
        <p>{blueprint.description.movement}</p>
        <p>{blueprint.description.attack}</p>
      </div>
    </>
  );
};

type CollapsibleSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

const CollapsibleSection = ({ title, description, children, defaultOpen = false }: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`collapsible-section ${isOpen ? 'open' : ''}`}>
      <button
        className="collapsible-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        type="button"
      >
        <span>{title}</span>
        <span className="chevron" aria-hidden="true" />
      </button>
      {description && <p className="collapsible-description">{description}</p>}
      {isOpen && <div className="collapsible-body">{children}</div>}
    </section>
  );
};

const ArmyBuilder = () => {
  const { currentUser, updateArmy } = useUser();
  const [selectedUnits, setSelectedUnits] = useState<ArmyUnitInstance[]>(currentUser?.army ?? []);
  const [activeUnitId, setActiveUnitId] = useState<string>(() => units[0]?.id ?? '');
  const activeUnit = useMemo(
    () => units.find((unit) => unit.id === activeUnitId) ?? units[0] ?? null,
    [activeUnitId]
  );
  const statCards = useMemo(
    () => [
      {
        id: 'attack',
        label: 'Attack',
        value: activeUnit ? activeUnit.damage : '—',
        suffix: '',
        icon: '⚔️'
      },
      {
        id: 'defense',
        label: 'Defense',
        value: activeUnit ? activeUnit.defense : '—',
        suffix: '',
        icon: '🛡️'
      },
      {
        id: 'speed',
        label: 'Speed',
        value: activeUnit ? activeUnit.speed : '—',
        suffix: activeUnit ? ' ticks' : '',
        icon: '⚡'
      },
      {
        id: 'range',
        label: 'Range',
        value: activeUnit ? activeUnit.range : '—',
        suffix: '',
        icon: '🎯'
      }
    ],
    [activeUnit]
  );

  const currentUserId = currentUser?.id ?? null;

  useEffect(() => {
    setSelectedUnits(currentUser?.army ?? []);
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    updateArmy(selectedUnits);
  }, [selectedUnits, currentUserId, updateArmy]);

  const totalCost = selectedUnits.reduce((sum, unit) => sum + unit.cost, 0);
  const remainingBudget = maxBudget - totalCost;
  const unitLimitReached = selectedUnits.length >= maxUnits;
  const canModify = Boolean(currentUser);

  const addUnitToArmy = (unit: Unit) => {
    if (!canModify) return;
    setSelectedUnits((prev) => {
      if (prev.length >= maxUnits) return prev;
      const costSoFar = prev.reduce((sum, entry) => sum + entry.cost, 0);
      if (costSoFar + unit.cost > maxBudget) return prev;

      const instance: ArmyUnitInstance = {
        ...unit,
        instanceId: crypto.randomUUID()
      };

      return [...prev, instance];
    });
  };

  const addActiveUnit = () => {
    if (!activeUnit) return;
    addUnitToArmy(activeUnit);
  };

  const removeUnit = (instanceId: string) => {
    if (!canModify) return;
    setSelectedUnits((prev) => prev.filter((unit) => unit.instanceId !== instanceId));
  };

  const clearArmy = () => {
    if (!canModify) return;
    setSelectedUnits([]);
  };

  const addDisabled =
    !canModify ||
    !activeUnit ||
    unitLimitReached ||
    totalCost + (activeUnit?.cost ?? 0) > maxBudget;

  const attackScore = selectedUnits.reduce((sum, unit) => sum + unit.damage, 0);

  const rosterSummary = useMemo(() => {
    const summaryMap = new Map<
      string,
      {
        unit: ArmyUnitInstance;
        count: number;
        instanceIds: string[];
      }
    >();

    selectedUnits.forEach((unit) => {
      const current = summaryMap.get(unit.id);
      if (current) {
        current.count += 1;
        current.instanceIds.push(unit.instanceId);
      } else {
        summaryMap.set(unit.id, {
          unit,
          count: 1,
          instanceIds: [unit.instanceId]
        });
      }
    });

    return Array.from(summaryMap.values()).map((entry) => ({
      id: entry.unit.id,
      unit: entry.unit,
      count: entry.count,
      instanceIds: entry.instanceIds,
      supplyPerUnit: entry.unit.cost,
      totalSupply: entry.count * entry.unit.cost
    }));
  }, [selectedUnits]);

  const resourceSummary = [
    {
      id: 'coins',
      label: 'Coins',
      value: `${currentUser?.gold ?? 0}`,
      hint: 'Spend wisely',
      icon: '🪙'
    },
    {
      id: 'supply',
      label: 'Supply',
      value: `${totalCost} / ${maxBudget}`,
      hint: `${remainingBudget} remaining`,
      icon: '📦'
    },
    {
      id: 'attack',
      label: 'Attack score',
      value: attackScore,
      hint: `${selectedUnits.length} units`,
      icon: '⚔️'
    },
    {
      id: 'level',
      label: 'Commander level',
      value: currentUser?.level ?? 1,
      hint: 'Progress to next tier',
      icon: '⭐'
    }
  ];

  const handleCardKey = (event: KeyboardEvent<HTMLElement>, unitId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveUnitId(unitId);
    }
  };

  const getRecruitState = (unit: Unit) => {
    if (!canModify) {
      return { disabled: true, reason: 'Login to recruit' };
    }
    if (selectedUnits.length >= maxUnits) {
      return { disabled: true, reason: 'Unit cap reached' };
    }
    if (totalCost + unit.cost > maxBudget) {
      return { disabled: true, reason: 'Not enough supply' };
    }
    return { disabled: false, reason: '' };
  };

  return (
    <div className="army-builder-dashboard">
      <header className="builder-header">
        <div className="builder-header__intro">
          <p className="eyebrow">Command console</p>
          <h1>Army Builder</h1>
          <p>Create a focused strike force before deployment.</p>
        </div>
        <div className="resource-bar" role="list">
          {resourceSummary.map((resource) => (
            <div key={resource.id} className="resource-pill" role="listitem">
              <span className="resource-icon" aria-hidden="true">
                {resource.icon}
              </span>
              <div>
                <p>{resource.label}</p>
                <strong>{resource.value}</strong>
                <small>{resource.hint}</small>
              </div>
            </div>
          ))}
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="roster-panel panel" aria-label="Current army">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Current army</p>
              <h2>{selectedUnits.length ? `${selectedUnits.length} / ${maxUnits} units` : 'No units selected'}</h2>
            </div>
            {selectedUnits.length > 0 && canModify && (
              <button className="btn btn-secondary" type="button" onClick={clearArmy}>
                Clear army
              </button>
            )}
          </div>
          <p className="panel-subtitle">{remainingBudget} supply available · {maxBudget} cap</p>

          <div className="roster-list">
            {rosterSummary.length === 0 && (
              <div className="empty-state">
                <p>Recruit units from the right to see them here.</p>
              </div>
            )}

            {rosterSummary.map((entry) => (
              <div key={entry.id} className="roster-item">
                <div className="roster-item__meta">
                  <span className="unit-icon" aria-hidden="true">
                    {entry.unit.icon || entry.unit.name.charAt(0)}
                  </span>
                  <div>
                    <p>{entry.unit.name}</p>
                    <small>
                      {entry.count} unit{entry.count > 1 ? 's' : ''} · {entry.supplyPerUnit} supply each
                    </small>
                  </div>
                </div>
                <div className="roster-item__actions">
                  <span className="supply-chip">{entry.totalSupply} 🪙</span>
                  {canModify && (
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => removeUnit(entry.instanceIds[0])}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="main-column">
          <section className="catalog-panel panel" aria-label="Unit catalog">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Unit catalog</p>
                <h2>Recruit reinforcements</h2>
              </div>
              <p className="panel-subtitle">Tap a card for intel, then recruit with available supply.</p>
            </div>

            <div className="catalog-grid">
              {units.map((unit) => {
                const { disabled, reason } = getRecruitState(unit);
                return (
                  <article
                    key={unit.id}
                    className={`unit-card ${activeUnit?.id === unit.id ? 'unit-card--active' : ''}`}
                  >
                    <div
                      className="unit-card__body"
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveUnitId(unit.id)}
                      onKeyDown={(event) => handleCardKey(event, unit.id)}
                      aria-pressed={activeUnit?.id === unit.id}
                    >
                      <div className="unit-card__media" aria-hidden="true">
                        <span>{unit.icon || unit.name.charAt(0)}</span>
                      </div>
                      <div className="unit-card__info">
                        <div>
                          <h3>{unit.name}</h3>
                          <p>{unit.cost} supply</p>
                        </div>
                        <div className="unit-card__stats">
                          <span>
                            ⚔️ {unit.damage}
                          </span>
                          <span>
                            🛡️ {unit.defense}
                          </span>
                          <span>
                            ⚡ {unit.speed}
                          </span>
                          <span>
                            🎯 {unit.range}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="unit-card__actions">
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={disabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveUnitId(unit.id);
                          addUnitToArmy(unit);
                        }}
                      >
                        Recruit – {unit.cost} 🪙
                      </button>
                      {disabled && reason && <small className="unit-card__hint">{reason}</small>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="intel-panel panel" aria-label="Unit intel">
            <div className="spotlight">
              <div className="spotlight__media">
                {activeUnit ? (
                  <UnitPreviewCanvas unit={activeUnit} />
                ) : (
                  <div className="unit-visual__placeholder">
                    <span role="img" aria-label="Target">🎯</span>
                    <p>Select a unit</p>
                  </div>
                )}
                <div className="spotlight__actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={addActiveUnit}
                    disabled={addDisabled}
                  >
                    {canModify ? `Recruit – ${activeUnit?.cost ?? 0} 🪙` : 'Login to recruit'}
                  </button>
                  <span className="available-supply">{remainingBudget} supply remaining</span>
                </div>
              </div>
              <div className="spotlight__stats">
                <div className="spotlight__header">
                  <p className="eyebrow">Currently viewing</p>
                  <h2>{activeUnit?.name ?? 'Select a unit'}</h2>
                  {activeUnit && <p className="spotlight__cost">{activeUnit.cost} supply</p>}
                </div>
                <div className="stat-grid" role="list">
                  {statCards.map((stat) => (
                    <div key={stat.id} className="stat-card" role="listitem">
                      <span aria-hidden="true">{stat.icon}</span>
                      <div>
                        <p>{stat.label}</p>
                        <strong>
                          {stat.value}
                          {stat.suffix && <small>{stat.suffix}</small>}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="collapsible-stack">
              <CollapsibleSection
                key={`strengths-${activeUnit?.id ?? 'none'}`}
                title="Strengths"
                description="Deployment notes and battlefield role"
              >
                {(activeUnit?.behaviorOptions ?? []).length > 0 ? (
                  <ul>
                    {activeUnit?.behaviorOptions.map((behavior) => (
                      <li key={behavior}>{behavior}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No strengths documented.</p>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                key={`upgrades-${activeUnit?.id ?? 'none'}`}
                title="Upgrades"
                description="Unlockable modifiers"
              >
                {(activeUnit?.upgradeOptions ?? []).length > 0 ? (
                  <ul>
                    {activeUnit?.upgradeOptions.map((upgrade) => (
                      <li key={upgrade}>{upgrade}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No upgrades available.</p>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                key={`movement-${activeUnit?.id ?? 'none'}`}
                title="Movement & threat"
                description="Preview movement arcs and attack reach"
              >
                <MiniBoard unit={activeUnit} />
              </CollapsibleSection>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ArmyBuilder;
