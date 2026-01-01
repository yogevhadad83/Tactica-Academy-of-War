type PositionLike = { row: number; col: number };

type PlacementLike = {
  position: PositionLike;
  instanceId?: string;
  id?: string;
};

export type PlacementBoundsError = {
  unitId: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
};

export type PlacementBoundsValidationResult =
  | { ok: true }
  | { ok: false; error: PlacementBoundsError };

const isFiniteInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);

/**
 * Validates every unit position is within the provided board dimensions.
 *
 * Coordinate mapping:
 * - x => col
 * - y => row
 */
export function validatePlacementsInBounds(
  placements: PlacementLike[],
  cols: number,
  rows: number
): PlacementBoundsValidationResult {
  for (const unit of placements) {
    const col = unit.position?.col;
    const row = unit.position?.row;

    if (!isFiniteInt(col) || !isFiniteInt(row) || col < 0 || col >= cols || row < 0 || row >= rows) {
      const unitId = unit.instanceId ?? unit.id ?? 'unknown-unit';
      return {
        ok: false,
        error: {
          unitId,
          col: typeof col === 'number' ? col : Number.NaN,
          row: typeof row === 'number' ? row : Number.NaN,
          cols,
          rows,
        },
      };
    }
  }

  return { ok: true };
}
