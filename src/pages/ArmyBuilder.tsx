import { useEffect, useMemo, useState } from 'react';
import { units } from '../data/units';
import type { ArmyUnitInstance, Unit } from '../types';
import { useUser } from '../context/UserContext';
import './ArmyBuilder.css';
import UnitPreviewCanvas from '../components/UnitPreviewCanvas';

const FEATURED_UNIT_IDS = ['knight', 'beast', 'archer'];
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
        'board-cell',
        (row + col) % 2 === 0 ? 'light' : 'dark',
        isOrigin ? 'origin' : '',
        canMove ? 'move' : '',
        canAttack ? 'attack' : '',
        canMove && canAttack ? 'focus' : ''
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
      <div className="board-legend">
        <span className="legend-item">
          <span className="legend-dot move" /> Move arc
        </span>
        <span className="legend-item">
          <span className="legend-dot attack" /> Attack reach
        </span>
        <span className="legend-item">
          <span className="legend-dot origin" /> Current unit
        </span>
      </div>
      <div className="board-note">
        <p>{blueprint.description.movement}</p>
        <p>{blueprint.description.attack}</p>
      </div>
    </>
  );
};

const ArmyBuilder = () => {
  const { currentUser, updateArmy } = useUser();
  const [selectedUnits, setSelectedUnits] = useState<ArmyUnitInstance[]>(currentUser?.army ?? []);
  const [isTacticsCollapsed, setIsTacticsCollapsed] = useState(false);
  const featuredUnits = useMemo(
    () => units.filter((unit) => FEATURED_UNIT_IDS.includes(unit.id)),
    []
  );
  const [activeUnitId, setActiveUnitId] = useState<string | null>(() => featuredUnits[0]?.id ?? null);
  const activeUnit = useMemo(
    () => featuredUnits.find((unit) => unit.id === activeUnitId) ?? featuredUnits[0] ?? null,
    [featuredUnits, activeUnitId]
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

  const addActiveUnit = () => {
    if (!canModify || !activeUnit) return;
    if (unitLimitReached || totalCost + activeUnit.cost > maxBudget) return;

    const instance: ArmyUnitInstance = {
      ...activeUnit,
      instanceId: crypto.randomUUID()
    };

    setSelectedUnits((prev) => [...prev, instance]);
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

  return (
    <div className="army-builder-v2">
      <header className="army-builder-v2__header">
        <div>
          <p className="eyebrow">Armoria Battle Lab</p>
          <h1>Army Builder</h1>
        </div>
        <div className="header-stats">
          <div className="stat-pill">
            <span>Supply</span>
            <strong>
              {totalCost} / {maxBudget}
            </strong>
            <em className={remainingBudget < 50 ? 'danger' : ''}>{remainingBudget} remaining</em>
          </div>
          <div className="stat-pill">
            <span>Units</span>
            <strong>
              {selectedUnits.length} / {maxUnits}
            </strong>
          </div>
          {selectedUnits.length > 0 && canModify && (
            <button className="ghost-btn" onClick={clearArmy}>
              Reset army
            </button>
          )}
        </div>
      </header>

      <div className="builder-stage">
        <aside className="unit-gallery" aria-label="Unit gallery">
          <p className="gallery-label">Unit catalog</p>
          <div className="gallery-list">
            {featuredUnits.map((unit) => (
              <button
                key={unit.id}
                className={`gallery-tile ${activeUnit?.id === unit.id ? 'active' : ''}`}
                onClick={() => setActiveUnitId(unit.id)}
                aria-pressed={activeUnit?.id === unit.id}
              >
                <div className="unit-thumb" aria-hidden="true">
                  <div className="unit-thumb__img">{unit.name.charAt(0)}</div>
                </div>
                <div>
                  <p className="tile-title">{unit.name}</p>
                  <span className="tile-sub">{unit.cost} supply</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="unit-showcase">
          <div className="unit-visual" role="presentation">
            {activeUnit ? (
              <UnitPreviewCanvas unit={activeUnit} />
            ) : (
              <div className="unit-visual__placeholder">
                <span>🎯</span>
                <p>Select a unit</p>
              </div>
            )}
            <div className="unit-visual-overlay">
              <div className="recruit-row">
                <div className="recruit-cost">
                  <span aria-hidden="true">🪙</span>
                  <span>{activeUnit ? `${activeUnit.cost} supply` : '—'}</span>
                </div>
                <button
                  className="primary-btn recruit-btn"
                  onClick={addActiveUnit}
                  disabled={addDisabled}
                >
                  {canModify ? 'Recruit' : 'Login to recruit'}
                </button>
              </div>
              <div className="unit-inline-stats" role="list">
                {statCards.map((stat) => (
                  <div key={stat.id} className="inline-stat" role="listitem">
                    <span aria-hidden="true">{stat.icon}</span>
                    <div>
                      <p>{stat.label}</p>
                      <strong>
                        {stat.value}
                        <small>{stat.suffix}</small>
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="unit-details-panel">
            <div className="unit-summary">
              <div>
                <p className="eyebrow">Currently viewing</p>
                <h2>{activeUnit?.name ?? '—'}</h2>
              </div>
              <div className="unit-summary__placeholder" />
            </div>

            {remainingBudget < 0 && (
              <p className="warning">Supply exceeded – remove a unit to proceed.</p>
            )}

            <div className="unit-extra">
              <div>
                <p className="eyebrow">Strengths</p>
                <ul>
                  {(activeUnit?.behaviorOptions ?? []).map((behavior) => (
                    <li key={behavior}>{behavior}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow">Upgrades</p>
                <ul>
                  {(activeUnit?.upgradeOptions ?? []).map((upgrade) => (
                    <li key={upgrade}>{upgrade}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="selected-army-bar">
            <div>
              <p className="eyebrow">Your formation</p>
              <strong>{selectedUnits.length ? `${selectedUnits.length} units ready` : 'No units selected'}</strong>
            </div>
            <div className="army-chip-row">
              {selectedUnits.length === 0 && <span className="placeholder">Add units to populate your army.</span>}
              {selectedUnits.map((unit) => (
                <button
                  key={unit.instanceId}
                  className="army-chip"
                  onClick={() => removeUnit(unit.instanceId)}
                  disabled={!canModify}
                >
                  <span>{unit.icon}</span>
                  {unit.name}
                  <small>{unit.cost}</small>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className={`tactics-panel ${isTacticsCollapsed ? 'collapsed' : ''}`}>
          <div className="tactics-panel__header">
            <div>
              <p className="eyebrow">Movement & threat</p>
              <h3>{activeUnit?.name ?? 'Select a unit'}</h3>
            </div>
            <button
              className="ghost-btn"
              onClick={() => setIsTacticsCollapsed((prev) => !prev)}
            >
              {isTacticsCollapsed ? 'Expand' : 'Collapse'}
            </button>
          </div>
          {!isTacticsCollapsed && (
            <div className="tactics-panel__body">
              <MiniBoard unit={activeUnit} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default ArmyBuilder;
