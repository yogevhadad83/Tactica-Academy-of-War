import { useState } from 'react';
import type { PlacedUnit, Position } from '../types';
import './BoardView.css';

const BOARD_SIZE = 12;

const BoardView = () => {
  // Mock some placed units for demonstration
  const [placedUnits] = useState<PlacedUnit[]>([
    {
      id: 'demo-1',
      name: 'Warrior',
      type: 'warrior',
      attack: 15,
      defense: 12,
      health: 100,
      speed: 5,
      range: 1,
      cost: 50,
      icon: '⚔️',
      position: { row: 10, col: 5 },
      team: 'player'
    },
    {
      id: 'demo-2',
      name: 'Archer',
      type: 'archer',
      attack: 12,
      defense: 8,
      health: 80,
      speed: 6,
      range: 3,
      cost: 45,
      icon: '🏹',
      position: { row: 10, col: 6 },
      team: 'player'
    },
    {
      id: 'demo-3',
      name: 'Mage',
      type: 'mage',
      attack: 20,
      defense: 6,
      health: 70,
      speed: 4,
      range: 4,
      cost: 60,
      icon: '🔮',
      position: { row: 1, col: 5 },
      team: 'enemy'
    },
    {
      id: 'demo-4',
      name: 'Tank',
      type: 'tank',
      attack: 10,
      defense: 20,
      health: 150,
      speed: 3,
      range: 1,
      cost: 70,
      icon: '🛡️',
      position: { row: 1, col: 6 },
      team: 'enemy'
    }
  ]);

  const [selectedCell, setSelectedCell] = useState<Position | null>(null);

  const getUnitAt = (row: number, col: number): PlacedUnit | undefined => {
    return placedUnits.find(u => u.position.row === row && u.position.col === col);
  };

  const handleCellClick = (row: number, col: number) => {
    setSelectedCell({ row, col });
  };

  const renderCell = (row: number, col: number) => {
    const unit = getUnitAt(row, col);
    const isSelected = selectedCell?.row === row && selectedCell?.col === col;
    
    return (
      <div
        key={`${row}-${col}`}
        className={`board-cell ${unit ? `has-unit ${unit.team}` : ''} ${isSelected ? 'selected' : ''}`}
        onClick={() => handleCellClick(row, col)}
      >
        <div className="cell-coords">{row},{col}</div>
        {unit && (
          <div className="unit-on-board">
            <div className="unit-icon-board">{unit.icon}</div>
            <div className="unit-health-bar">
              <div className="health-fill" style={{ width: `${(unit.health / 100) * 100}%` }}></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const selectedUnit = selectedCell ? getUnitAt(selectedCell.row, selectedCell.col) : null;

  return (
    <div className="board-view-container">
      <div className="board-view-header">
        <h1>🎮 Battle Board</h1>
        <p className="header-subtitle">12×12 Tactical Battlefield</p>
      </div>

      <div className="board-view-content">
        <div className="board-wrapper">
          <div className="board-grid">
            {Array.from({ length: BOARD_SIZE }, (_, row) =>
              Array.from({ length: BOARD_SIZE }, (_, col) => renderCell(row, col))
            )}
          </div>
        </div>

        <div className="board-sidebar">
          <h2>Cell Info</h2>
          {selectedCell ? (
            <div className="cell-info">
              <p><strong>Position:</strong> ({selectedCell.row}, {selectedCell.col})</p>
              {selectedUnit ? (
                <>
                  <div className="unit-details">
                    <div className="unit-icon-large">{selectedUnit.icon}</div>
                    <h3>{selectedUnit.name}</h3>
                    <div className={`team-badge ${selectedUnit.team}`}>
                      {selectedUnit.team === 'player' ? '🔵 Player' : '🔴 Enemy'}
                    </div>
                    <div className="unit-stats-board">
                      <div className="stat-row">
                        <span>⚔️ Attack:</span>
                        <span>{selectedUnit.attack}</span>
                      </div>
                      <div className="stat-row">
                        <span>🛡️ Defense:</span>
                        <span>{selectedUnit.defense}</span>
                      </div>
                      <div className="stat-row">
                        <span>❤️ Health:</span>
                        <span>{selectedUnit.health}</span>
                      </div>
                      <div className="stat-row">
                        <span>⚡ Speed:</span>
                        <span>{selectedUnit.speed}</span>
                      </div>
                      <div className="stat-row">
                        <span>🎯 Range:</span>
                        <span>{selectedUnit.range}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="empty-cell-message">This cell is empty</p>
              )}
            </div>
          ) : (
            <p className="no-selection">Click on a cell to see details</p>
          )}

          <div className="legend">
            <h3>Legend</h3>
            <div className="legend-item">
              <div className="legend-color player"></div>
              <span>Player Units</span>
            </div>
            <div className="legend-item">
              <div className="legend-color enemy"></div>
              <span>Enemy Units</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BoardView;
