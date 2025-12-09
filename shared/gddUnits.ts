// Single source of truth for unit stats based on GDD v1.0
export type GddUnitId = 'recruit' | 'archer' | 'zombie' | 'knight' | 'beast' | 'mage' | 'giant';

export interface GddUnitDefinition {
  name: string;
  icon: string;
  hp: number;
  defense: number;
  shield: number;
  damage: number;
  speed: number;
  range: number;
  supplyCost: number;
  creditCost: number;
  reviveCost: number;
  behaviorOptions: string[];
  description?: string;
}

export interface UnitLike {
  id: string;
  name: string;
  icon: string;
  cost: number;
  hp: number;
  damage: number;
  defense: number;
  shield?: number;
  speed: number;
  range: number;
  behaviorOptions: string[];
  upgradeOptions: string[];
  supplyCost?: number;
  creditCost?: number;
  reviveCost?: number;
  description?: string;
}

export const GDD_UNIT_DEFS: Record<GddUnitId, GddUnitDefinition> = {
  recruit: {
    name: 'Recruit',
    icon: '\uD83C\uDF96\uFE0F',
    hp: 1,
    defense: 0,
    shield: 0,
    damage: 1,
    speed: 1,
    range: 1,
    supplyCost: 1,
    creditCost: 0,
    reviveCost: 0,
    behaviorOptions: ['Aggressive', 'Opportunistic', 'Runner'],
    description: 'Basic filler unit with selectable lane logic.'
  },
  knight: {
    name: 'Knight',
    icon: '\u2694\uFE0F',
    hp: 2,
    defense: 2,
    shield: 1,
    damage: 3,
    speed: 1,
    range: 1,
    supplyCost: 3,
    creditCost: 40,
    reviveCost: 10,
    behaviorOptions: [],
    description: 'Durable frontline with a small shield.'
  },
  beast: {
    name: 'Beast',
    icon: '\u1FAA8',
    hp: 6,
    defense: 1,
    shield: 0,
    damage: 3,
    speed: 1,
    range: 1,
    supplyCost: 4,
    creditCost: 60,
    reviveCost: 15,
    behaviorOptions: [],
    description: 'Heavy bruiser that trades blows up close.'
  },
  archer: {
    name: 'Archer',
    icon: '\uD83C\uDFF9',
    hp: 2,
    defense: 0,
    shield: 0,
    damage: 2,
    speed: 1,
    range: 3,
    supplyCost: 2,
    creditCost: 25,
    reviveCost: 6,
    behaviorOptions: ['Target weakest enemy', 'Target strongest enemy', 'Prioritize shooting', 'Prioritize advancing'],
    description: 'Ranged unit with a 3x3 forward volley and weak melee swipe.'
  },
  giant: {
    name: 'Giant',
    icon: '\uD83D\uDDFF',
    hp: 8,
    defense: 0,
    shield: 0,
    damage: 3,
    speed: 1,
    range: 1,
    supplyCost: 5,
    creditCost: 100,
    reviveCost: 25,
    behaviorOptions: ['Attack arc: Left', 'Attack arc: Center', 'Attack arc: Right'],
    description: 'Slow powerhouse that cleaves in a chosen arc.'
  },
  mage: {
    name: 'Mage',
    icon: '\u2728',
    hp: 2,
    defense: 0,
    shield: 0,
    damage: 0,
    speed: 1,
    range: 1,
    supplyCost: 4,
    creditCost: 80,
    reviveCost: 20,
    behaviorOptions: ['Sidestep priority: Left', 'Sidestep priority: Right'],
    description: 'Paralyzes targets for 3 turns; no direct damage.'
  },
  zombie: {
    name: 'Zombie',
    icon: '\uD83E\uDDDF',
    hp: 5,
    defense: 0,
    shield: 0,
    damage: 4,
    speed: 1,
    range: 1,
    supplyCost: 3,
    creditCost: 50,
    reviveCost: 12,
    behaviorOptions: ['Sidestep left first', 'Sidestep right first'],
    description: 'Horizontal attacker that sidesteps before shuffling forward.'
  }
};

export const GDD_UNIT_IDS: GddUnitId[] = ['recruit', 'archer', 'zombie', 'knight', 'beast', 'mage', 'giant'];

export const buildGddUnit = (id: GddUnitId): UnitLike => {
  const def = GDD_UNIT_DEFS[id];
  if (!def) {
    throw new Error(`Unknown GDD unit id: ${id}`);
  }

  return {
    id,
    name: def.name,
    icon: def.icon,
    cost: def.supplyCost,
    supplyCost: def.supplyCost,
    creditCost: def.creditCost,
    reviveCost: def.reviveCost,
    hp: def.hp,
    damage: def.damage,
    defense: def.defense,
    shield: def.shield ? def.shield : undefined,
    speed: def.speed,
    range: def.range,
    behaviorOptions: def.behaviorOptions,
    upgradeOptions: [],
    description: def.description
  };
};

export const GDD_UNITS: UnitLike[] = GDD_UNIT_IDS.map((id) => buildGddUnit(id));
