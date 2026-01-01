# Pre-Battle Preview Feature — Quick Reference

## User Flow

1. **Initiate Challenge** → Player A sends challenge to Player B
2. **Accept Challenge** → Player B accepts
3. **Preview Phase** → Both see side-by-side boards
4. **Challenger Turn** → Player A makes 1 change (move/swap/replace/edit behavior)
5. **Defender Turn** → Player B makes 1 change
6. **Battle Starts** → Fight with modified boards

## Key Components

### BattlePreview Component
Location: `src/components/BattlePreview.tsx`

Shows two boards + change panel. Pass preview state from `useMultiplayer()`:
```tsx
<BattlePreview
  matchId={previewMatchId}
  yourRole={previewYourRole}
  opponentName={previewOpponentName}
  yourBoard={previewYourBoard}
  opponentBoard={previewOpponentBoard}
  isYourTurn={previewTurn === previewYourRole}
  onSendChange={handleSendPreviewChange}
/>
```

### useMultiplayer Hook
Returns preview state:
- `previewMatchId`, `previewYourRole`, `previewOpponentName`
- `previewYourBoard`, `previewOpponentBoard`, `previewTurn`
- `sendPreviewChange(matchId, change)`

### Server: applyPreviewChange()
Applies one of four change types. In `server/src/index.ts`:
```typescript
function applyPreviewChange(board: ArmyConfig, change: PreviewChange): void
```

## Change Types

### Move
```typescript
{ type: 'move', unitInstanceId: '...', newPosition: { row, col } }
```

### Swap
```typescript
{ type: 'swap', unitInstanceId: '...', targetInstanceId: '...' }
```

### Replace *(stub for future)*
```typescript
{ type: 'replace', unitInstanceId: '...', newPlayerUnitId: '...' }
```

### Edit Behavior *(stub for future)*
```typescript
{ type: 'edit_behavior', unitInstanceId: '...', newBehaviors: ['...'] }
```

## WebSocket Messages

### Client → Server
```typescript
{
  type: 'preview_change',
  matchId: string,
  change: PreviewChange
}
```

### Server → Client
```typescript
// Start preview
{ type: 'preview_start', matchId, youAre, opponentName, yourBoard, opponentBoard, turn }

// Board update
{ type: 'preview_update', matchId, turn, updatedBoard, side: 'yours'|'opponent' }

// Commitment
{ type: 'preview_committed', matchId, side: 'yours'|'opponent' }
```

## Important Files

| File | Purpose |
|------|---------|
| `server/src/types.ts` | Message type definitions |
| `server/src/index.ts` | Preview match logic (lines ~30-120, 250-400) |
| `src/hooks/useGameServer.ts` | Preview state management |
| `src/pages/BoardView.tsx` | Preview phase rendering |
| `src/components/BattlePreview.tsx` | Preview UI |
| `src/pages/BoardView.css` | Preview styling |

## Testing

### Minimal Test
1. Open two browser windows
2. Player A sends challenge
3. Player B accepts
4. Both should see preview page
5. Player A makes move
6. Player B makes move
7. Battle starts with modified boards

### Server Logs
Look for:
```
Preview match [matchId] created: [name1] (A) vs [name2] (B)
Preview board updated: ...
Preview match [matchId] complete. Starting battle...
```

## Extending with New Change Types

1. Add type to `PreviewChangeType` in both `server/src/types.ts` and `src/hooks/useGameServer.ts`
2. Add handler case in `server/src/index.ts` `applyPreviewChange()`
3. Add UI in `src/components/BattlePreview.tsx` to trigger that change
4. Test with manual browser testing

Example for Replace type:
```typescript
case 'replace': {
  const unit = board.find(u => u.instanceId === change.unitInstanceId);
  const newUnitDef = buildGddUnit(change.newPlayerUnitId);
  Object.assign(unit, newUnitDef);
  unit.instanceId = change.unitInstanceId; // Preserve ID
  break;
}
```

## Common Issues

### Preview not showing
- Check: Is `previewMatchId` non-null in BoardView render
- Check: Are preview state values being populated
- Check: Server sending `preview_start` message

### Changes not applying
- Check: Server receiving `preview_change` message (server logs)
- Check: `applyPreviewChange()` not throwing errors
- Check: Board validation passing (no occupancy conflicts)

### Wrong player's turn
- Check: `previewTurn` matches `previewYourRole` for UI enable/disable
- Check: Server enforcing turn: `if (previewMatch.currentTurn !== playerRole) return error`

### Battle not starting
- Check: Both `aCommitted` and `bCommitted` flags true
- Check: `runServerBattle()` being called with modified boards
- Check: Both players receiving `battle_result` message

## Performance Notes

- Preview match stored in-memory on server (no DB)
- Cleaned up automatically after battle
- Max ~1000 concurrent preview matches before memory concern
- Realtime sync via WebSocket (low latency)

## Security Notes

- Only authenticated players can send changes
- Turn enforcement on server (client can't bypass)
- Board validation prevents invalid moves
- No data persisted to user accounts (match-scoped only)
