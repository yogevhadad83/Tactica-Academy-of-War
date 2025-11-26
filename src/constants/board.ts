export const CELL_SIZE = 1.4;

export const cellToWorld = (row: number, col: number, size: number) => {
  const offset = ((size - 1) * CELL_SIZE) / 2;
  return {
    x: col * CELL_SIZE - offset,
    z: row * CELL_SIZE - offset
  };
};

export const boardKey = (row: number, col: number) => `${row}-${col}`;
