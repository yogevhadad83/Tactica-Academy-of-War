import type { PlacedUnit } from '../types';
import { buildGddUnit, type GddUnitId } from '../../shared/gddUnits';

export type TrainingSuccessCondition = 'winMatch';

export interface TrainingAllowedEdits {
  maxRepositions: number;
  maxBehaviorChanges: number;
  behaviorChangeUnitIds: GddUnitId[];
}

export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  instructorBrief: string;
  rewardCredits: number;
  playerGoesFirst: boolean;
  playArea?: {
    cols: number;
    rowsPerSide: number;
    colStart: number;
    playerRowStart: number;
    enemyRowStart: number;
  };
  playerStartBoard: PlacedUnit[];
  opponentStartBoard: PlacedUnit[];
  allowedEdits: TrainingAllowedEdits;
  successCondition: TrainingSuccessCondition;
}

function makePlacedUnit(params: {
  unitId: GddUnitId;
  instanceId: string;
  team: 'player' | 'enemy';
  row: number;
  col: number;
  selectedBehaviors?: string[];
}): PlacedUnit {
  const unit = buildGddUnit(params.unitId);

  return {
    ...unit,
    instanceId: params.instanceId,
    team: params.team,
    position: { row: params.row, col: params.col },
    selectedBehaviors: params.selectedBehaviors
  } as PlacedUnit;
}

const ACTIVE_COL = 2;

export const trainingDrills: TrainingModule[] = [
  {
    id: 'drill-01-tempo-trap',
    title: 'Drill 01 — Tempo Trap (Pull Back to Win)',
    description: 'A single-lane duel: pull back one tile, let the enemy lunge first, then counter.',
    instructorBrief:
      'Cadet: This is a tempo drill. The opponent strikes first. You get ONE move before battle: reposition your recruit on the highlighted tile behind the front. Do not change behaviors. Do not add or remove units. After you move, start the battle and let the enemy step into your swing.\n\nRules: Bot acts first. Only the single highlighted column is active. One action per unit per turn (move OR attack). Victory when the enemy Recruit falls. Defeat if your Recruit dies first.',
    rewardCredits: 25,
    playerGoesFirst: false,
    // Active area: 1 column, 2 rows per side, centered so front tiles touch.
    playArea: {
      cols: 1,
      rowsPerSide: 2,
      colStart: ACTIVE_COL,
      playerRowStart: 6,
      enemyRowStart: 4,
    },
    playerStartBoard: [
      makePlacedUnit({ unitId: 'recruit', instanceId: 'p-recruit', team: 'player', row: 6, col: ACTIVE_COL })
    ],
    opponentStartBoard: [
      makePlacedUnit({ unitId: 'recruit', instanceId: 'e-recruit', team: 'enemy', row: 5, col: ACTIVE_COL })
    ],
    allowedEdits: {
      maxRepositions: 1,
      maxBehaviorChanges: 0,
      behaviorChangeUnitIds: []
    },
    successCondition: 'winMatch'
  }
];
