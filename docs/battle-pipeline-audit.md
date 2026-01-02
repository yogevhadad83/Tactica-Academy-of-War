# Battle Pipeline Audit (PvP divergence)

## Simulation code paths
- Core engine: advanceBattleTick/initializeBattle in [src/engine/battleEngine.ts](src/engine/battleEngine.ts#L57-L219) drive all per-turn logic.
- Training/local runner: runTrainingBattle (deterministic, no lucky draw) in [src/engine/runTrainingBattle.ts](src/engine/runTrainingBattle.ts#L1-L76) builds a timeline client-side.
- PvP (current, Supabase flow): [src/pages/PvpMatch.tsx](src/pages/PvpMatch.tsx#L496-L610) calls runTrainingBattle locally when match.status === IN_PROGRESS, producing a client-only timeline.
- Server engine wrapper (legacy/unused in Supabase flow): runServerBattle in [server/src/runBattle.ts](server/src/runBattle.ts#L91-L148) loads the bundled engine and computes the timeline on the server.
- Legacy websocket PvP/preview flow: server-driven preview/battle pipeline in [server/src/index.ts](server/src/index.ts#L212-L541) uses runServerBattle and mirrors the timeline for player B before sending to clients.

## Mirroring / coordinate transforms
- Server-side normalization: Team B units are mirrored into the enemy zone before simulation in [server/src/runBattle.ts](server/src/runBattle.ts#L95-L105).
- Server-side playback mirroring for player B: [server/src/runBattle.ts](server/src/runBattle.ts#L150-L182) flips rows and swaps teams in the emitted timeline.
- Client pre-battle placement: player units may be shifted into the lower half if stored in rows 0-5, in [src/pages/PvpMatch.tsx](src/pages/PvpMatch.tsx#L327-L343).
- Client opponent placement: opponent rows are conditionally mirrored (row → 11-row) before display/building in [src/pages/PvpMatch.tsx](src/pages/PvpMatch.tsx#L345-L355).
- Engine board constants (PLAYER_ZONE_START etc.) shared by both sides in [src/engine/battleEngine.ts](src/engine/battleEngine.ts#L7-L38).

## Current PvP flow (after PRE_BATTLE → IN_PROGRESS)
1. Client fetches match bundle and applies pre_battle_adjustments locally in [src/pages/PvpMatch.tsx](src/pages/PvpMatch.tsx#L171-L415).
2. startMatch only updates matches.status to IN_PROGRESS in Supabase ([src/lib/pvp.ts](src/lib/pvp.ts#L403-L443)); no battle is run server-side.
3. Supabase realtime UPDATE to IN_PROGRESS triggers local simulation. Each client builds its own "player" army (their participant) and "enemy" army (opponent) using perspective-specific transforms ([src/pages/PvpMatch.tsx](src/pages/PvpMatch.tsx#L496-L555)).
4. Each client runs runTrainingBattle locally to generate the full timeline and immediately plays it back. The timeline is neither stored nor shared; playerGoesFirst is derived from local side (A/B), so the two clients can diverge.
5. Result is inferred from the locally simulated timeline and not persisted; completeMatch merely flips status ([src/lib/pvp.ts](src/lib/pvp.ts#L445-L483)).

## Legacy (pre-DB/challenges) pipeline
- Players connected to the Node websocket server. preview_change mutations were applied server-side, then runServerBattle computed the canonical timeline and winner ([server/src/index.ts](server/src/index.ts#L424-L541)).
- Player A received the canonical timeline; player B received mirrorTimelineForPlayerB(timeline), so both clients replayed the same authoritative simulation with perspective-specific mirroring.

## Divergence root cause
- The new Supabase-driven PvP flow removed the server simulation step; both clients now run runTrainingBattle locally from their own perspective. Because playerGoesFirst depends on which side you are (A vs B) and each client applies its own mirroring/row transforms, the two simulations produce different timelines and unit orientations. No shared RNG seed or canonical timeline exists, so any placement asymmetry or transform mismatch results in players watching different battles.

## Dead/duplicate code candidates
- The websocket preview/battle flow in [server/src/index.ts](server/src/index.ts#L212-L541) and mirror helpers in [server/src/runBattle.ts](server/src/runBattle.ts#L150-L182) are unused by the current Supabase PvP path.
- PvP currently reuses the training runner ([src/engine/runTrainingBattle.ts](src/engine/runTrainingBattle.ts#L1-L76)) for competitive matches instead of using the server wrapper.

## Minimal refactor plan (make server authoritative again)
1. Reintroduce server-side battle execution for PvP: when a match transitions to IN_PROGRESS, call runServerBattle with both participants' boards on the server (Node service or a Supabase function) and persist the canonical timeline + winner.
2. Ship timelines to clients: either store in a match_battles table and watch via realtime, or send via a lightweight API. Deliver both the canonical timeline and a pre-mirrored copy for player B (reuse mirrorTimelineForPlayerB server-side).
3. Update client playback: remove runTrainingBattle for PvP in [src/pages/PvpMatch.tsx](src/pages/PvpMatch.tsx#L496-L610); instead fetch/use the authoritative timeline, and only apply client-side mirroring if the server does not provide the B-perspective timeline.
4. Keep mirroring in one place: let the server own perspective transforms (pre-battle normalization + post-battle mirroring). Client should stop re-mirroring opponent rows for playback once it consumes server timelines.
5. Optional cleanup: retire or gate the legacy websocket preview path if Supabase is the only entry point, or reuse its server battle invocation for the new flow.

## Files/functions to adjust next
- [src/pages/PvpMatch.tsx](src/pages/PvpMatch.tsx#L327-L610): stop local simulation for PvP, consume server timeline, and simplify mirroring logic to display server-provided frames.
- [src/lib/pvp.ts](src/lib/pvp.ts#L403-L483): make startMatch invoke the server-side battle job and fetch/store the resulting timeline; adjust completeMatch to read persisted winner.
- [server/src/runBattle.ts](server/src/runBattle.ts#L91-L182): expose a callable entry (HTTP/WS/function) that accepts two armies and returns canonical + mirrored timelines.
- [server/src/index.ts](server/src/index.ts#L212-L541) or a new handler: wire match start requests from the app to runServerBattle and emit/store results (can reuse existing mirroring helper).