import { BOARD_COLS, BOARD_SIZE } from '../engine/battleEngine';
import type { PlacedUnit } from '../types';

export type MirrorBoardOptions = {
  boardRows?: number;
  boardCols?: number;
  rowOffset?: number;
  forceTeam?: PlacedUnit['team'];
};

/**
 * Mirrors opponent placements vertically so their front row appears closest to the camera.
 * Shared by pre-battle preview and training opponent previews.
 */
export const mirrorOpponentBoardForDisplay = (
  units: PlacedUnit[],
  options: MirrorBoardOptions = {}
): PlacedUnit[] => {
  const boardRows = options.boardRows ?? BOARD_SIZE;
  const boardCols = options.boardCols ?? BOARD_COLS;
  const rowOffset = options.rowOffset ?? 0;

  return units
    .map((unit) => {
      const adjustedRow = unit.position.row - rowOffset;
      return {
        ...unit,
        ...(options.forceTeam ? { team: options.forceTeam } : {}),
        position: {
          ...unit.position,
          row: boardRows - 1 - adjustedRow,
        },
      } as PlacedUnit;
    })
    .filter(
      (unit) =>
        unit.position.row >= 0 &&
        unit.position.row < boardRows &&
        unit.position.col >= 0 &&
        unit.position.col < boardCols
    );
};
