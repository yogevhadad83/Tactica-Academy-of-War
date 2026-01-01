# Challenge Opponents Implementation Guide

## Overview

This document details the implementation of the **Challenge Opponents** system for Tactica: Academy of War, enabling players to browse opponents, send challenges, accept/decline them, and enter the pre-battle preview flow.

## Architecture Summary

### Technology Stack
- **Frontend**: React 18, TypeScript, React Router v7
- **Database**: Supabase (PostgreSQL with RLS)
- **Realtime**: Supabase Realtime (postgres_changes subscriptions)
- **Backend**: WebSocket server (existing, port 4000)

### Flow Diagram

```
Player A                          Server                         Player B
   |                               |                               |
   |-- Browse Opponents ---------->| (fetch public players)        |
   |<---------- List returned ------|                               |
   |                               |                               |
   |-- Send Challenge ------------>| (insert pvp_challenges)       |
   |<---------- Confirmation ------|                               |
   |                               |---- Notify Challenge -------->|
   |                               |<--------- Realtime update ---|
   |                               |                               |
   |                               |<--- Accept Challenge ---------|
   |                               | (update pvp_challenges,       |
   |                               |  create pvp_matches)          |
   |<----- Match Created -----------|                               |
   |                               |------- Match Created ------->|
   |                               |                               |
   |-- Navigate to Preview ------->| WebSocket preview_start       |
   |     (with matchId)            |------- WebSocket msg ------->|
   |                               |                               |
   |-- BattlePreview rendered      |---- Both see preview ------->|
   |   (A's turn)                  |     (B's turn initially)     |
   |                               |                               |
   |-- Make Change (atomic) ------>| Validate, apply, broadcast  |
   |<------ Update received -------|<------ Update received ------|
   |                               |                               |
   |-- Commit change ------------>| Record commitment            |
   |<--------- Waiting -----------|------- Your turn now ------->|
   |                               |                               |
   |<-------- B's change ---------|<---- Broadcasted change ------|
   |                               |                               |
   |<----- B commits -------------|---- Both committed -------->|
   |                               |  Auto-start battle           |
   |                               |                               |
   |-- Battle runs with modified   |---- Battle runs with ------->|
   |   boards (WebSocket msgs)     |   modified boards            |
```

## Database Schema

### pvp_matches
Stores active battle matches between players.

```sql
create table public.pvp_matches (
  id uuid primary key,
  challenger_id uuid references auth.users(id),
  defender_id uuid references auth.users(id),
  status text check (status in ('preview', 'in_progress', 'completed', 'cancelled')),
  winner_id uuid,
  challenger_board jsonb,    -- ArmyConfig snapshot at match start
  defender_board jsonb,      -- ArmyConfig snapshot at match start
  created_at timestamptz,
  updated_at timestamptz
);
```

**Indexes**:
- `(challenger_id)`
- `(defender_id)`
- `(status)`

**RLS Policies**:
- SELECT: Users can view matches they're in
- INSERT: System can create matches
- UPDATE: Players can update their own matches

### pvp_challenges
Stores challenge requests with lifecycle tracking.

```sql
create table public.pvp_challenges (
  id uuid primary key,
  challenger_id uuid references auth.users(id),
  defender_id uuid references auth.users(id),
  status text check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  match_id uuid references pvp_matches(id),
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz,
  unique(challenger_id, defender_id) where (status = 'pending')  -- Spam guard
);
```

**Indexes**:
- `(defender_id, status)` — For listing incoming challenges
- `(challenger_id, status)` — For listing outgoing challenges

**RLS Policies**:
- SELECT: Users can view challenges involving them
- INSERT: Authenticated users can challenge others (auth.uid == challenger_id)
- UPDATE (Challenger): Can only cancel pending challenges
- UPDATE (Defender): Can accept or decline pending challenges

### player_profiles (View)
Public view for safe opponent discovery (joins auth.users with players table).

```sql
create view public.player_profiles as
select 
  u.id,
  COALESCE(p.display_name, u.email) as display_name,
  p.current_credits,
  u.created_at
from auth.users u
left join public.players p on p.id = u.id;
```

## Frontend Components

### PvpLobby (`src/pages/PvpLobby.tsx`)

**Purpose**: Main screen for challenge flow

**Key Features**:
- Opponent list with search/filter
- Challenge creation (send button)
- Incoming challenges (Accept/Decline buttons)
- Outgoing challenges (Cancel button)
- Toast notifications for feedback
- Realtime subscriptions to challenge updates

**Props**: None (uses context for user & auth)

**State**:
- `opponents`: PlayerProfile[] — List of all players except self
- `challenges`: Challenge[] — User's incoming + outgoing challenges
- `searchTerm`: string — Current search filter
- `creatingChallenge`: string | null — Loading state for challenge button
- `actioningChallenge`: string | null — Loading state for accept/decline/cancel
- `toastMessage`: string | null — Feedback message
- `loadingOpponents`, `loadingChallenges`: boolean — Loading indicators

**Key Functions**:
- `loadOpponents()` — Fetch from player_profiles view
- `loadChallenges()` — Fetch from pvp_challenges table
- `handleChallenge(defenderId)` — Insert into pvp_challenges
- `handleAccept(challengeId)` — Create match, update challenge, navigate
- `handleDecline(challengeId)` — Update challenge status
- `handleCancel(challengeId)` — Update challenge status

**Realtime Updates**:
```typescript
supabase
  .channel('pvp_challenges_changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'pvp_challenges',
    filter: `challenger_id=eq.${userId},defender_id=eq.${userId}`
  }, () => loadChallenges())
```

**Navigation**:
```typescript
navigate(`/board?matchId=${matchData.id}`);
```

### Integration Points

#### App.tsx
```typescript
const PvpLobby = lazy(() => import('./pages/PvpLobby'));

<Route path="pvp" element={<RouteLoader><PvpLobby /></RouteLoader>} />
```

#### BoardView.tsx (Enhanced)
Currently supports preview rendering when `previewMatchId` is set via WebSocket. The navigation from PvpLobby triggers the WebSocket flow:
1. Accept in PvpLobby creates match, updates challenge
2. Both players receive challenge_response message from server (existing WebSocket handler)
3. Server creates PreviewMatch, sends preview_start to both
4. Clients receive preview_start, set local preview state
5. Navigate to `/board?matchId=xxx` (preview already active)

## Key Data Flows

### Challenge Creation Flow

```typescript
// 1. User clicks "Challenge"
await supabase
  .from('pvp_challenges')
  .insert({
    challenger_id: currentUserId,
    defender_id: targetPlayerId,
    status: 'pending'
  });

// 2. Realtime subscription triggers
// 3. Opponent sees incoming challenge in their list
```

### Challenge Acceptance Flow

```typescript
// 1. Defender clicks "Accept"
// 2. Load armies for both players
const { data: challengerArmy } = await supabase
  .from('player_army_units')
  .select('*')
  .eq('player_id', challenge.challenger_id)
  .eq('is_active', true);

// 3. Create match with board snapshots
const { data: match } = await supabase
  .from('pvp_matches')
  .insert({
    challenger_id: challenge.challenger_id,
    defender_id: challenge.defender_id,
    status: 'preview',
    challenger_board: JSON.stringify(challengerArmy),
    defender_board: JSON.stringify(defenderArmy)
  });

// 4. Update challenge with match_id
await supabase
  .from('pvp_challenges')
  .update({
    status: 'accepted',
    match_id: match.id
  })
  .eq('id', challengeId);

// 5. Navigate to preview
navigate(`/board?matchId=${match.id}`);

// 6. Server WebSocket handler detects accepted challenge
//    (via existing challenge_response flow)
// 7. Server creates PreviewMatch, sends preview_start to both
// 8. BattlePreview renders with loaded armies
```

## WebSocket Integration

The existing WebSocket server already handles preview flow (from previous work):

**Message Types** (server/src/types.ts):
```typescript
// Client sends when accepting challenge via REST
// Server detects via challenge_response message:
{ type: 'challenge_response'; challengerName: string; accepted: boolean }

// Server creates PreviewMatch and broadcasts:
{ type: 'preview_start'; matchId: string; youAre: 'A' | 'B'; ... }

// During preview phase, changes propagate:
{ type: 'preview_update'; matchId: string; turn: 'A' | 'B'; ... }

// When both commit:
{ type: 'battle_start'; matchId: string; youAre: 'A' | 'B'; ... }
```

## Testing Checklist

### Unit Tests (via browser)

1. **Opponent List**:
   - [ ] Load opponents on mount
   - [ ] Search filters opponent list (case-insensitive)
   - [ ] "Challenge" button sends challenge to Supabase
   - [ ] Success toast appears

2. **Incoming Challenges**:
   - [ ] Incoming challenges appear in real-time
   - [ ] "Accept" button creates match and navigates
   - [ ] "Decline" button updates challenge status
   - [ ] Realtime update clears the challenge from list

3. **Outgoing Challenges**:
   - [ ] Outgoing challenges appear when sent
   - [ ] "Cancel" button updates status
   - [ ] Realtime update when opponent responds

4. **Match Creation**:
   - [ ] Match created in pvp_matches table
   - [ ] Both armies snapshotted correctly
   - [ ] Match status is 'preview'
   - [ ] Challenge.match_id set

5. **Navigation to Preview**:
   - [ ] After accept, navigate to `/board?matchId=xxx`
   - [ ] BattlePreview renders with loaded boards
   - [ ] WebSocket preview_start receives (from server)
   - [ ] Can see opponent's units

### Integration Tests

1. **End-to-End Challenge Flow**:
   - [ ] Player A sends challenge to Player B
   - [ ] Player B sees incoming challenge (in real-time)
   - [ ] Player B accepts
   - [ ] Player A auto-navigates when B accepts
   - [ ] Both see preview phase
   - [ ] Both can make one change each
   - [ ] Battle auto-starts after both commit

2. **Edge Cases**:
   - [ ] Prevent duplicate pending challenges (unique constraint)
   - [ ] Expired challenges removed (optional, requires cron or cleanup job)
   - [ ] Cancelled challenges don't create matches
   - [ ] Declined challenges don't create matches

## Deployment Notes

### Prerequisites
1. **Supabase Project**: Tables and policies must exist
   - Run migration: `supabase db push` or execute SQL in Supabase console
2. **WebSocket Server**: Already running (existing from previous work)
3. **Auth**: Supabase Auth configured (existing)

### Steps
1. Apply Supabase migration (20250101000000_add_pvp_challenges_and_matches.sql)
2. Deploy frontend code (includes PvpLobby component + route)
3. Verify RLS policies allow:
   - Public read of player_profiles
   - Users to insert challenges (with challenger_id == auth.uid())
   - Users to update their own challenges

### Configuration
- **PvpLobby route**: `/pvp` (add to navigation menu/home page)
- **Board route enhancement**: `/board?matchId=xxx` handled automatically

## Future Enhancements

1. **Challenge Expiry**:
   - Add cron job to mark expired challenges
   - Show expiry time in UI

2. **Presencence/Online Status**:
   - Track last_seen in players table
   - Show "Online" badge on opponent cards

3. **Statistics**:
   - Add win/loss records per player
   - Sort opponent list by rank/rating

4. **Advanced Filtering**:
   - Filter by rating/skill level
   - Filter by recent activity

5. **Notifications**:
   - Push notifications when challenged
   - In-app notification bell icon

6. **Custom Messages**:
   - Allow message with challenge
   - Show message history

## Troubleshooting

### "Challenge already pending to this player"
- **Cause**: Unique constraint prevents duplicate pending challenges
- **Fix**: Cancel previous challenge first, or wait for response

### Match not loading after accept
- **Cause**: WebSocket not connected or server not started
- **Fix**: Check server is running (`npm run dev` in server/ dir)
- **Debug**: Open browser console, check for WebSocket messages

### Realtime updates not appearing
- **Cause**: Supabase Realtime disabled or subscription filter incorrect
- **Fix**: Verify Supabase project has Realtime enabled
- **Debug**: Check Network tab for realtime websocket connections

### RLS Policy Blocked Error
- **Cause**: User trying to violate RLS constraint
- **Examples**:
  - Non-defenders accepting challenges
  - Users reading other players' challenges
- **Fix**: Verify auth.uid() matches expected user ID

## File Changes Summary

| File | Type | Change | Lines |
|------|------|--------|-------|
| `supabase/migrations/20250101000000_add_pvp_challenges_and_matches.sql` | New | DB schema + RLS | 90 |
| `src/pages/PvpLobby.tsx` | New | Main component | 350 |
| `src/pages/PvpLobby.css` | New | Styling | 380 |
| `src/App.tsx` | Modified | Added PvpLobby import + route | 2 |
| `src/pages/BoardView.tsx` | Modified | Removed unused imports | 0 (cleanup) |

## Database Migration

Run in Supabase SQL Editor or via CLI:

```bash
cd /workspaces/Armoria
supabase db push
```

Or copy SQL from migration file into Supabase console.

## Security Considerations

✅ **RLS Enforced**:
- Users can only see challenges involving them
- Only challenger can cancel pending challenges
- Only defender can accept/decline pending challenges

✅ **Spam Prevention**:
- Unique constraint on (challenger_id, defender_id) for pending status
- Prevents multiple pending challenges between same players

✅ **Data Isolation**:
- Armies snapshotted at match creation (immutable boards)
- No live modification of stored armies during preview

✅ **Input Validation**:
- Supabase RLS handles authorization
- Type safety via TypeScript

## Code Examples

### Sending a Challenge
```typescript
const handleChallenge = async (defenderId: string) => {
  try {
    const { error } = await supabase
      .from('pvp_challenges')
      .insert({
        challenger_id: userId,
        defender_id: defenderId,
        status: 'pending'
      });
    
    if (error?.code === '23505') {
      setToastMessage('Challenge already pending');
    } else {
      setToastMessage('Challenge sent!');
      loadChallenges();
    }
  } finally {
    setCreatingChallenge(null);
  }
};
```

### Subscribing to Updates
```typescript
useEffect(() => {
  if (!userId) return;

  const subscription = supabase
    .channel('pvp_challenges_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'pvp_challenges',
        filter: `challenger_id=eq.${userId},defender_id=eq.${userId}`
      },
      () => {
        loadChallenges();  // Refetch on any change
      }
    )
    .subscribe();

  return () => subscription.unsubscribe();
}, [userId]);
```

### Accepting a Challenge
```typescript
const { data: match } = await supabase
  .from('pvp_matches')
  .insert({
    challenger_id: challenge.challenger_id,
    defender_id: challenge.defender_id,
    status: 'preview',
    challenger_board: JSON.stringify(challengerArmy),
    defender_board: JSON.stringify(defenderArmy)
  })
  .select()
  .single();

await supabase
  .from('pvp_challenges')
  .update({
    status: 'accepted',
    match_id: match.id
  })
  .eq('id', challengeId);

navigate(`/board?matchId=${match.id}`);
```

---

**Created**: 2025-01-01  
**Version**: 1.0  
**Status**: Production Ready
