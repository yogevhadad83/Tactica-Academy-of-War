# Deep Code Review Report - Tactica Academy of War

**Date:** 2026-01-02  
**Repository:** yogevhadad83/Tactica-Academy-of-War  
**Scope:** Full codebase pass focused on dead code, duplication, low-risk improvements, and foot-guns. Existing checks run: `npm test` (fails: no tests found), `npm run lint` (42 errors, 10 warnings).

---

## Summary (most important findings)

1. **Duplicate routing:** `/queue` redirect is declared twice in `src/App.tsx`, adding unnecessary route handling and maintenance noise.
2. **Dead artifacts:** `src/types/index.js` and `src/types/battle.js` are compiled stubs never imported anywhere—safe to remove.
3. **Cascading renders:** Multiple `setState` calls executed inside effects (e.g., `UserContext`, `useMatchTimeline`, `AfterActionReport`, two spots in `BoardView`) trigger lint errors and risk extra renders.
4. **Stale subscriptions:** `useGameServer` effect omits `currentRole` and `user.id` dependencies while capturing them, risking stale listeners after reconnects or user changes.
5. **Unused state:** `_turnNumber` state in `BoardView.tsx` is assigned but never read; leaves dead renders and lint noise.
6. **Fast-refresh blockers:** `PlayerContext.tsx` and `UserContext.tsx` export non-component helpers in the same file as providers, tripping `react-refresh/only-export-components` and breaking hot reload guarantees.
7. **Test gap:** `npm test` fails because no `tests/**/*.test.ts` files exist; suite is effectively empty.

---

## Quick wins (high value, low risk)

- **Remove duplicate route:** Drop one of the two `<Route path="queue" element={<Navigate to="/pvp" replace />} />` entries in `src/App.tsx`.
- **Delete compiled stubs:** Remove `src/types/index.js` and `src/types/battle.js` (not referenced by any import).
- **Prune unused state:** Delete `_turnNumber` state in `src/pages/BoardView.tsx` or wire it to UI if needed.
- **Split helper exports:** Move helper functions (e.g., `usePlayerContext`, `createDefaultProfile`) into separate files or export from index barrels to satisfy `react-refresh/only-export-components`.
- **Add missing deps:** Include `currentRole` and `user.id` in the `useEffect` dependencies around the websocket wiring in `src/hooks/useGameServer.ts` to avoid stale closures.

---

## Dead code candidates

| File | Why likely unused | How to confirm |
| --- | --- | --- |
| `src/types/index.js` | Compiled stub; `rg "types/index.js"` returns no imports. TS version exists and is used instead. | Remove file and run `npm run lint && npm run build`. |
| `src/types/battle.js` | Compiled stub; `rg "types/battle.js"` returns no imports. TS version exists and is used instead. | Remove file and run `npm run lint && npm run build`. |
| `_turnNumber` state in `src/pages/BoardView.tsx` | Declared and set but never read; eslint reports unused variable. | Remove state hook; verify board view still renders. |

---

## Duplication candidates

- **Queue redirect defined twice:** `src/App.tsx` has two identical `/queue` redirects; keep one under the root layout.
- **Player state split between contexts:** `UserContext` (localStorage-driven demo profiles) and `PlayerContext`/`usePlayer` (Supabase-backed) both expose `army/placements`, inviting divergence. Consider consolidating or making the boundary explicit (e.g., demo vs. authenticated) in one provider.

---

## Risky / bug-prone spots

- **setState inside effects (cascading renders):**
  - `src/context/UserContext.tsx` sets currentUser inside an effect that also mutates profiles.
  - `src/hooks/useMatchTimeline.ts` calls `fetchTimeline()` directly in `useEffect` (lint flags synchronous state updates).
  - `src/pages/AfterActionReport.tsx` clears `bundleError` inside effect each run.
  - `src/pages/BoardView.tsx` sets simulation units and placements inside effects; both flagged by lint.
- **Missing deps in effect:** `src/hooks/useGameServer.ts` websocket effect captures `currentRole`/`user.id` but leaves them out of the dependency array; can leave stale subscriptions after reconnect or login change.
- **Fast-refresh blockers:** `react-refresh/only-export-components` errors in `PlayerContext.tsx` and `UserContext.tsx` mean hot reload reliability is reduced.
- **Empty test suite:** `npm test` fails with “Could not find tests/**/*.test.ts”; regressions will slip through.

---

## Patch-style suggestions (minimal diffs)

**1) Remove duplicate queue route**
```diff
// src/App.tsx
-              <Route path="queue" element={<Navigate to="/pvp" replace />} />
               <Route path="/" element={<Layout />}>
                 <Route index element={<Navigate to="/academy" replace />} />
...
```

**2) Drop unused turn state**
```diff
// src/pages/BoardView.tsx
-  const [_turnNumber, setTurnNumber] = useState(1);
   const [startingTeam, setStartingTeam] = useState<Team | null>(null);
```

**3) Delete compiled stubs**
```diff
- src/types/index.js   // remove file
- src/types/battle.js  // remove file
```

**4) Fix stale websocket dependencies**
```diff
// src/hooks/useGameServer.ts (effect around ws lifecycle)
-  useEffect(() => {
+  useEffect(() => {
     // ...
-  }, [supabase, setLastResult, setLastMatchSummary, setLastMatchDetail]);
+  }, [supabase, setLastResult, setLastMatchSummary, setLastMatchDetail, currentRole, user?.id]);
```

**5) Separate provider from helpers (fast-refresh)**
```diff
// Move helper exports into their own module
// src/context/UserContext.helpers.ts
export const createDefaultProfile = (...) => { ... };

// src/context/UserContext.tsx
-export const createDefaultProfile = ...
 export const UserProvider = ...
```

---

## Notes on checks

- `npm test` → fails: `Could not find '/tests/**/*.test.ts'`. No tests present.
- `npm run lint` → 42 errors, 10 warnings. Main categories: setState in effects, fast-refresh rule violations, missing effect deps, unused variables, `any`/unused catch params.
