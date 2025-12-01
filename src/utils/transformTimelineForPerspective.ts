// NO-OP: Server now performs all mirroring. Keep this API to avoid import breakage.
import type { BattleTickResult } from '../engine/battleEngine';
export type MatchPerspective = 'A' | 'B';
export function transformTimelineForPerspective(
  timeline: BattleTickResult[],
  _perspective: MatchPerspective | null
): BattleTickResult[] {
  return timeline;
}
