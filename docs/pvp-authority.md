# PvP Authority Notes

## Where mirroring happens
- Server endpoint `POST /api/pvp/matches/:matchId/run` mirrors side B into canonical form and produces `timeline_a` and `timeline_b`.
- Clients never mirror timelines or coordinates during playback; they consume the server-provided timelines as-is.

## Where simulation happens
- Only on the server run endpoint. It resolves the battle and persists timelines into `public.match_timelines`.
- The client no longer calls any local battle engine for PvP.

## What the client does
- Start: call `runMatchOnServer` via `startMatch(matchId)` to trigger the server run and receive timelines.
- Fallback: if already IN_PROGRESS, fetch timelines from `match_timelines` with `getMatchTimeline(matchId)` (retrying briefly if missing).
- Playback: choose `timelineA` when viewer is side A, `timelineB` when viewer is side B, and feed directly into the read-only replay component.

## Deleted / removed code paths
- PvP page no longer builds local battle armies or calls any local simulation (`runTrainingBattle`) for PvP.
- Client-side opponent mirroring during PvP playback removed; timelines are rendered without transforms.
- Training battle runner now guards against non-training usage (throws if mode is not `training`).
