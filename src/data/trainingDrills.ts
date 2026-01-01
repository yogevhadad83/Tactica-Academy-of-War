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

export const trainingDrills: TrainingModule[] = [
  {
    id: 'drill-01-lane-discipline',
    title: 'Lane Discipline',
    description: 'Practice Recruit lane behaviors to find a clean breach path.',
    instructorBrief:
      'Cadet: Your recruits will follow their lane logic exactly. Your task is to adjust up to 3 recruits (position and behavior) to exploit a weak lane and breach the enemy back row.\n\nTip: Runner favors the lane with fewer enemies. Aggressive favors the lane with more enemies. Moderate follows the line.',
    rewardCredits: 75,
    playerGoesFirst: true,
    // Global board is 6 columns × 12 rows (enemy rows 0–5, player rows 6–11).
    // This drill uses a smaller active area (2×3 per side) inside the global board.
    playArea: {
      cols: 3,
      rowsPerSide: 2,
      colStart: 1,
      playerRowStart: 6,
      enemyRowStart: 0,
    },
    playerStartBoard: [
      makePlacedUnit({ unitId: 'recruit', instanceId: 'p-r1', team: 'player', row: 7, col: 1, selectedBehaviors: ['Moderate'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'p-r2', team: 'player', row: 7, col: 2, selectedBehaviors: ['Moderate'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'p-r3', team: 'player', row: 7, col: 3, selectedBehaviors: ['Moderate'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'p-r4', team: 'player', row: 6, col: 2, selectedBehaviors: ['Moderate'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'p-r5', team: 'player', row: 6, col: 3, selectedBehaviors: ['Moderate'] })
    ],
    opponentStartBoard: [
      // Enemy clumps mid lanes, leaving a side lane more exploitable.
      makePlacedUnit({ unitId: 'recruit', instanceId: 'e-r1', team: 'enemy', row: 0, col: 2, selectedBehaviors: ['Moderate'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'e-r2', team: 'enemy', row: 1, col: 2, selectedBehaviors: ['Moderate'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'e-r3', team: 'enemy', row: 1, col: 3, selectedBehaviors: ['Moderate'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'e-r4', team: 'enemy', row: 0, col: 3, selectedBehaviors: ['Moderate'] })
    ],
    allowedEdits: {
      maxRepositions: 3,
      maxBehaviorChanges: 3,
      behaviorChangeUnitIds: ['recruit']
    },
    successCondition: 'winMatch'
  },
  {
    id: 'drill-02-supply-math',
    title: 'Supply Math',
    description: 'Reposition a mixed squad to avoid bad trades and secure a breach.',
    instructorBrief:
      'Cadet: This drill is about formation and lane commitment with a mixed squad under a 20-supply mindset. You may reposition up to 5 units, but you may not change behaviors.\n\nTip: Avoid feeding single units into stacked enemy lanes; coordinate your frontline and protect your archer.',
    rewardCredits: 100,
    playerGoesFirst: true,
    playerStartBoard: [
      // Mixed squad (no behavior edits required for MVP)
      makePlacedUnit({ unitId: 'knight', instanceId: 'p-k1', team: 'player', row: 7, col: 4 }),
      makePlacedUnit({ unitId: 'knight', instanceId: 'p-k2', team: 'player', row: 7, col: 5 }),
      makePlacedUnit({ unitId: 'archer', instanceId: 'p-a1', team: 'player', row: 6, col: 5, selectedBehaviors: ['Target: Weakest in range', 'Priority: Shooting'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'p-r1', team: 'player', row: 6, col: 3, selectedBehaviors: ['Moderate'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'p-r2', team: 'player', row: 6, col: 4, selectedBehaviors: ['Moderate'] }),
      makePlacedUnit({ unitId: 'zombie', instanceId: 'p-z1', team: 'player', row: 7, col: 2, selectedBehaviors: ['Sidestep left first'] })
    ],
    opponentStartBoard: [
      // Enemy punishes sloppy center pushes; player should re-lane and protect backline.
      makePlacedUnit({ unitId: 'knight', instanceId: 'e-k1', team: 'enemy', row: 1, col: 5 }),
      makePlacedUnit({ unitId: 'beast', instanceId: 'e-b1', team: 'enemy', row: 0, col: 5 }),
      makePlacedUnit({ unitId: 'archer', instanceId: 'e-a1', team: 'enemy', row: 0, col: 4, selectedBehaviors: ['Target: Strongest in range', 'Priority: Shooting'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'e-r1', team: 'enemy', row: 2, col: 4, selectedBehaviors: ['Moderate'] }),
      makePlacedUnit({ unitId: 'recruit', instanceId: 'e-r2', team: 'enemy', row: 2, col: 5, selectedBehaviors: ['Moderate'] })
    ],
    allowedEdits: {
      maxRepositions: 5,
      maxBehaviorChanges: 0,
      behaviorChangeUnitIds: []
    },
    successCondition: 'winMatch'
  }
];
