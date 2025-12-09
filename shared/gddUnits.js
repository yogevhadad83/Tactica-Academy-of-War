"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GDD_UNITS = exports.buildGddUnit = exports.GDD_UNIT_IDS = exports.GDD_UNIT_DEFS = void 0;
exports.GDD_UNIT_DEFS = {
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
exports.GDD_UNIT_IDS = ['recruit', 'archer', 'zombie', 'knight', 'beast', 'mage', 'giant'];
const buildGddUnit = (id) => {
    const def = exports.GDD_UNIT_DEFS[id];
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
exports.buildGddUnit = buildGddUnit;
exports.GDD_UNITS = exports.GDD_UNIT_IDS.map((id) => (0, exports.buildGddUnit)(id));
