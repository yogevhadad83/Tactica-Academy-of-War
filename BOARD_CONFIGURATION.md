# Board Configuration Guide

## Single Source of Truth

The battle board dimensions are defined in **`src/engine/battleEngine.ts`**:

```typescript
export const BOARD_SIZE = 12;      // Total rows
export const BOARD_COLS = 8;       // Total columns
export const PLAYER_ROWS = 6;      // Deployment zone rows per player
export const PLAYER_ZONE_START = 6; // Starting row for player zone
```

## Board Layout

The battle board is **12 rows × 8 columns**:
- **Rows 0-5**: Enemy deployment zone (from player's perspective)
- **Rows 6-11**: Player deployment zone

Each player gets 6 rows × 8 columns = 48 possible unit placement positions.

## Where These Constants Are Used

### Client Side
1. **`src/engine/battleEngine.ts`** - Main battle engine (SOURCE OF TRUTH)
2. **`src/engine/battleEngine.cjs`** - CommonJS build used by server
3. **`src/engine/demoBattle.ts`** - Demo/training battle logic
4. **`src/pages/BoardView.tsx`** - Imports from battleEngine
5. **`src/components/createTacticalBoard.ts`** - Receives dimensions as parameters

### Server Side
1. **`server/src/runBattle.ts`** - Imports BOARD_SIZE, BOARD_COLS, PLAYER_ROWS from battleEngine.cjs
2. **`server/src/index.ts`** - Uses local constants for demo battle (derived from battleEngine values)
3. **`server/src/battleTypes.ts`** - TypeScript interface defines what's exported from battleEngine

## How to Change Board Size

To change the board dimensions:

1. **Update `src/engine/battleEngine.ts`**:
   ```typescript
   export const BOARD_SIZE = <new_rows>;
   export const BOARD_COLS = <new_cols>;
   export const PLAYER_ROWS = <new_player_rows>;
   ```

2. **Rebuild battleEngine.cjs**:
   ```bash
   npm run build  # or whatever build script compiles TS to CJS
   ```

3. **Update matching constants in `src/engine/demoBattle.ts`** if they exist

4. **Rebuild the server**:
   ```bash
   cd server
   npm run build
   ```

5. **Test thoroughly** - board size changes affect:
   - Unit positioning validation
   - AI pathfinding and movement
   - Victory conditions
   - UI rendering
   - Camera positioning

## Notes

- The server imports board constants from the compiled `battleEngine.cjs` file
- Demo battles in `server/src/index.ts` now correctly use BOARD_COLS (8) instead of hardcoded 12
- All unit positions must be within bounds: `0 <= row < BOARD_SIZE` and `0 <= col < BOARD_COLS`
