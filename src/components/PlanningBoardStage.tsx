import { useEffect } from 'react';
import type { PlacedUnit } from '../types';
import type { TileOccupant, TileOwner } from './createTacticalBoard';
import ThreeBattleStage from './ThreeBattleStage';

export type PlanningBoardOwner = 'player' | 'opponent';

export type PlanningBoardStageProps = {
  owner: PlanningBoardOwner;
  boardSize: number;
  boardCols?: number;
  units: PlacedUnit[];
  disabledCells?: string[];
  dragActive?: boolean;
  canDropOnTile?: (row: number, col: number) => boolean;
  onTileHover?: (info: { row: number; col: number; occupied: TileOccupant | null }) => void;
  onTileDrop?: (info: { row: number; col: number; occupied: TileOccupant | null }) => void;
  onTileClick?: (info: { row: number; col: number; occupied: TileOccupant | null }) => void;
  onReady?: (ready: boolean) => void;
  dragSourceTile?: { row: number; col: number } | null;
  dragHoverTile?: { row: number; col: number } | null;
};

const PLANNING_CAMERA_PRESET = {
  distanceMultiplier: 1.1,
  heightMultiplier: 1.2,
  minHeight: 7
} as const;

const PlanningBoardStage = ({
  owner,
  boardSize,
  boardCols,
  units,
  disabledCells,
  dragActive = false,
  canDropOnTile,
  onTileHover,
  onTileDrop,
  onTileClick,
  onReady,
  dragSourceTile,
  dragHoverTile
}: PlanningBoardStageProps) => {
  const atlasPath = owner === 'player' ? '/texture/blueboard.png' : '/texture/redboard.png';
  const forceOwner: TileOwner = owner === 'player' ? 'blue' : 'red';

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[PlanningBoardStage] render', {
      owner,
      atlasPath,
      cameraPreset: PLANNING_CAMERA_PRESET
    });
  }, [owner, atlasPath]);

  return (
    <ThreeBattleStage
      boardSize={boardSize}
      boardCols={boardCols}
      units={units}
      hitCells={[]}
      hitEvents={[]}
      moveCells={[]}
      marchCells={[]}
      demoState="idle"
      disabledCells={disabledCells}
      interactionMode="planning"
      dragActive={dragActive}
      canDropOnTile={canDropOnTile}
      onTileHover={onTileHover}
      onTileDrop={onTileDrop}
      onTileClick={onTileClick}
      forceOwner={forceOwner}
      planningAtlasPath={atlasPath}
      planningCameraDistanceMultiplier={PLANNING_CAMERA_PRESET.distanceMultiplier}
      planningCameraHeightMultiplier={PLANNING_CAMERA_PRESET.heightMultiplier}
      planningCameraMinHeight={PLANNING_CAMERA_PRESET.minHeight}
      onReady={onReady}
      dragSourceTile={dragSourceTile}
      dragHoverTile={dragHoverTile}
    />
  );
};

export default PlanningBoardStage;
