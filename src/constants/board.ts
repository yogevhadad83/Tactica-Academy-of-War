export const CELL_SIZE = 1.4;

export const cellToWorld = (row: number, col: number, rows: number, cols: number) => {
  const offsetX = ((cols - 1) * CELL_SIZE) / 2;
  const offsetZ = ((rows - 1) * CELL_SIZE) / 2;
  return {
    x: col * CELL_SIZE - offsetX,
    z: row * CELL_SIZE - offsetZ
  };
};

export const boardKey = (row: number, col: number) => `${row}-${col}`;
