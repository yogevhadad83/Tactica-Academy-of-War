import type { Unit } from '../types';

export const units: Unit[] = [
  {
    id: 'knight',
    name: 'Knight',
    icon: '🗡️',
    cost: 85,
    hp: 190,
    damage: 32,
    defense: 16,
    speed: 8,
    range: 1,
    behaviorOptions: [
      'Hold formation line',
      'Shield nearest Archer',
      'Advance toward center objective'
    ],
    upgradeOptions: [
      'Reinforced plating (+4 defense)',
      'Halberd drills (+3 damage)',
      'Battle medic (+10% hp regen)'
    ]
  },
  {
    id: 'horseman',
    name: 'Horseman',
    icon: '🐎',
    cost: 100,
    hp: 170,
    damage: 24,
    defense: 14,
    speed: 4,
    range: 1,
    behaviorOptions: [
      'Flank the slowest enemy',
      'Charge the backline',
      'Intercept advancing Beast'
    ],
    upgradeOptions: [
      'Lance mastery (+4 damage)',
      'War banners (+10% speed)',
      'Shock cavalry (stun on impact)'
    ]
  },
  {
    id: 'archer',
    name: 'Archer',
    icon: '🏹',
    cost: 65,
    hp: 100,
    damage: 20,
    defense: 8,
    speed: 5,
    range: 5,
    behaviorOptions: [
      'Focus wounded targets',
      'Prioritize Dragons',
      'Volley fire over allies'
    ],
    upgradeOptions: [
      'Composite bows (+2 range)',
      'Flaming arrows (+5 damage vs Beast)',
      'Camouflaged cloaks (-10% enemy hit)'
    ]
  },
  {
    id: 'beast',
    name: 'Beast',
    icon: '🪨',
    cost: 160,
    hp: 260,
    damage: 34,
    defense: 20,
    speed: 4,
    range: 1,
    behaviorOptions: [
      'Crush nearest fortification',
      'Guard the Dragon',
      'Sweep the frontline'
    ],
    upgradeOptions: [
      'Stone gauntlets (+6 damage)',
      'Mountain hide (+8 defense)',
      'Earthshaker stomp (shockwave)'
    ]
  },
  {
    id: 'dragon',
    name: 'Dragon',
    icon: '🐉',
    cost: 220,
    hp: 360,
    damage: 48,
    defense: 26,
    speed: 5,
    range: 6,
    behaviorOptions: [
      'Breathe flame on clusters',
      'Dive on archers',
      'Circle above objective'
    ],
    upgradeOptions: [
      'Molten breath (+8 damage cone)',
      'Adamant scales (+10 defense)',
      'Sky dominion (+2 range)'
    ]
  }
];
