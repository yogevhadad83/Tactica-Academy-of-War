"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEnemyArmy = exports.initializeBattle = exports.advanceBattleTick = exports.luckyDraw = exports.DEFAULT_ENEMY_FORMATION = exports.PLAYER_ZONE_START = exports.PLAYER_ROWS = exports.BOARD_COLS = exports.BOARD_SIZE = void 0;
exports.BOARD_SIZE = 12;
exports.BOARD_COLS = 8;
exports.PLAYER_ROWS = 6;
exports.PLAYER_ZONE_START = exports.BOARD_SIZE - exports.PLAYER_ROWS;
exports.DEFAULT_ENEMY_FORMATION = [
    { row: 0, col: 2 },
    { row: 0, col: 4 },
    { row: 0, col: 6 },
    { row: 1, col: 3 },
    { row: 1, col: 5 },
    { row: 2, col: 2 },
    { row: 2, col: 6 }
];
/** Randomly picks which team starts the battle */
const luckyDraw = () => (Math.random() < 0.5 ? 'player' : 'enemy');
exports.luckyDraw = luckyDraw;
/** Returns the opposing team */
const otherTeam = (team) => (team === 'player' ? 'enemy' : 'player');
const cloneUnits = (units) => units.map((unit) => ({
    ...unit,
    position: { ...unit.position },
    currentHp: unit.currentHp ?? unit.hp
}));
const isAlive = (unit) => (unit.currentHp ?? unit.hp) > 0;
const manhattan = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
const getOccupant = (units, row, col) => units.find((unit) => isAlive(unit) && unit.position.row === row && unit.position.col === col);
const directionForTeam = (team) => (team === 'player' ? -1 : 1);
const targetRowForTeam = (team) => (team === 'player' ? 0 : exports.BOARD_SIZE - 1);
const ARCHER_ID = 'archer';
const ARCHER_FORWARD_RANGE = 5; // keep constant for now; future player configs can override
const ARCHER_FORWARD_COLUMN_OFFSETS = [-1, 0, 1];
const findClosestTarget = (actor, candidates) => candidates
    .filter((unit) => unit.team !== actor.team && isAlive(unit))
    .sort((a, b) => manhattan(actor.position, a.position) - manhattan(actor.position, b.position))[0];
const findArcherForwardTarget = (actor, snapshot) => {
    const direction = directionForTeam(actor.team);
    const validCols = ARCHER_FORWARD_COLUMN_OFFSETS.map((offset) => actor.position.col + offset).filter((col) => col >= 0 && col < exports.BOARD_COLS);
    const candidates = [];
    for (let step = 1; step <= ARCHER_FORWARD_RANGE; step += 1) {
        const row = actor.position.row + direction * step;
        if (row < 0 || row >= exports.BOARD_SIZE) {
            break;
        }
        for (const col of validCols) {
            const target = getOccupant(snapshot, row, col);
            if (target) {
                candidates.push(target);
            }
        }
    }
    return findClosestTarget(actor, candidates);
};
/** Check if an ally unit at a given position will move forward this turn */
const willAllyMoveForward = (allyAtPosition, snapshot, checkedUnits) => {
    // Prevent infinite recursion
    if (checkedUnits.has(allyAtPosition.instanceId)) {
        return false;
    }
    checkedUnits.add(allyAtPosition.instanceId);
    const direction = directionForTeam(allyAtPosition.team);
    const nextRow = allyAtPosition.position.row + direction;
    // Can't move if at board edge
    if (nextRow < 0 || nextRow >= exports.BOARD_SIZE) {
        return false;
    }
    // Check for archer forward attack - if archer has a target, it won't move
    if (allyAtPosition.id === ARCHER_ID) {
        const forwardTarget = findArcherForwardTarget(allyAtPosition, snapshot);
        if (forwardTarget) {
            return false; // Archer will attack instead of move
        }
    }
    const occupant = getOccupant(snapshot, nextRow, allyAtPosition.position.col);
    if (!occupant) {
        // No one in front, ally will move
        return true;
    }
    if (occupant.team !== allyAtPosition.team) {
        // Enemy in front, ally will attack instead of move
        return false;
    }
    // Ally in front - check if that ally will also move forward (recursively)
    return willAllyMoveForward(occupant, snapshot, checkedUnits);
};
const collectTeamActions = (team, snapshot) => {
    const actions = [];
    const teamUnits = snapshot.filter((unit) => unit.team === team && isAlive(unit));
    for (const actor of teamUnits) {
        // Check for archer forward attack first
        if (actor.id === ARCHER_ID) {
            const forwardTarget = findArcherForwardTarget(actor, snapshot);
            if (forwardTarget) {
                actions.push({
                    actor,
                    type: 'attack',
                    targetUnit: forwardTarget,
                    targetPosition: { ...forwardTarget.position },
                    attackType: 'ranged'
                });
                continue;
            }
        }
        const direction = directionForTeam(actor.team);
        const nextRow = actor.position.row + direction;
        // Check if can move forward
        if (nextRow >= 0 && nextRow < exports.BOARD_SIZE) {
            const occupant = getOccupant(snapshot, nextRow, actor.position.col);
            if (!occupant) {
                // Can move forward
                actions.push({
                    actor,
                    type: 'move',
                    newPosition: { row: nextRow, col: actor.position.col }
                });
                continue;
            }
            if (occupant.team !== actor.team) {
                // Attack the enemy in front
                actions.push({
                    actor,
                    type: 'attack',
                    targetUnit: occupant,
                    targetPosition: { ...occupant.position },
                    attackType: 'melee'
                });
                continue;
            }
            // Ally in front - check if ally will move forward, allowing this unit to follow
            if (willAllyMoveForward(occupant, snapshot, new Set([actor.instanceId]))) {
                actions.push({
                    actor,
                    type: 'move',
                    newPosition: { row: nextRow, col: actor.position.col }
                });
                continue;
            }
        }
        // If blocked by ally or edge, try to attack nearest enemy
        const target = findClosestTarget(actor, snapshot);
        if (target) {
            const distance = manhattan(actor.position, target.position);
            const range = Math.max(1, actor.range);
            if (distance <= range) {
                // For melee attacks (range 1), only allow attacking enemies directly in front
                // (same column), not to the sides
                const isMeleeRange = range === 1;
                const isDirectlyInFront = target.position.col === actor.position.col;
                if (isMeleeRange && !isDirectlyInFront) {
                    // Melee unit cannot attack sideways - skip this action
                    continue;
                }
                actions.push({
                    actor,
                    type: 'attack',
                    targetUnit: target,
                    targetPosition: { ...target.position },
                    attackType: distance > 1 ? 'ranged' : 'melee'
                });
            }
        }
    }
    return actions;
};
/** Apply all collected actions simultaneously */
const applyActions = (actions, snapshot, recordMove, recordHit) => {
    // Apply all attacks simultaneously (damage is calculated based on pre-action state)
    const damageMap = new Map();
    for (const action of actions) {
        if (action.type === 'attack' && action.targetUnit) {
            const targetId = action.targetUnit.instanceId;
            const currentDamage = damageMap.get(targetId) ?? 0;
            damageMap.set(targetId, currentDamage + action.actor.damage);
        }
    }
    // Apply accumulated damage
    for (const [targetId, totalDamage] of damageMap) {
        const target = snapshot.find((unit) => unit.instanceId === targetId);
        if (target) {
            target.currentHp = Math.max(0, (target.currentHp ?? target.hp) - totalDamage);
        }
    }
    // Record hit events
    for (const action of actions) {
        if (action.type === 'attack' && action.targetUnit && action.attackType) {
            const target = snapshot.find((unit) => unit.instanceId === action.targetUnit.instanceId);
            if (target) {
                const didKill = !isAlive(target);
                recordHit(action.actor, target, action.attackType, didKill);
            }
        }
    }
    // Apply all moves simultaneously
    const moveActions = actions.filter((action) => action.type === 'move' && action.newPosition);
    const moveActionsByActorId = new Map();
    for (const action of moveActions) {
        moveActionsByActorId.set(action.actor.instanceId, action);
    }
    // Check for move collisions (two units moving to the same cell)
    const targetCells = new Map();
    for (const action of moveActions) {
        if (action.newPosition) {
            const key = `${action.newPosition.row}-${action.newPosition.col}`;
            const existing = targetCells.get(key) ?? [];
            existing.push(action);
            targetCells.set(key, existing);
        }
    }
    // Execute non-colliding moves
    for (const action of moveActions) {
        if (action.newPosition) {
            const key = `${action.newPosition.row}-${action.newPosition.col}`;
            const movesToCell = targetCells.get(key) ?? [];
            // Only move if this is the only unit trying to move there
            // and the cell is either empty or will be vacated by an ally also moving this turn
            const currentOccupant = getOccupant(snapshot, action.newPosition.row, action.newPosition.col);
            const occupantWillVacate = !!currentOccupant && moveActionsByActorId.has(currentOccupant.instanceId);
            if (movesToCell.length === 1 && (!currentOccupant || occupantWillVacate)) {
                recordMove(`${action.actor.position.row}-${action.actor.position.col}`);
                action.actor.position = { ...action.newPosition };
                recordMove(`${action.actor.position.row}-${action.actor.position.col}`);
            }
        }
    }
};
const evaluateWinner = (units) => {
    const playerReached = units.some((unit) => unit.team === 'player' && isAlive(unit) && unit.position.row === targetRowForTeam('player'));
    if (playerReached) {
        return 'player';
    }
    const enemyReached = units.some((unit) => unit.team === 'enemy' && isAlive(unit) && unit.position.row === targetRowForTeam('enemy'));
    if (enemyReached) {
        return 'enemy';
    }
    return null;
};
/**
 * Advances the battle by one turn.
 * All units of the current team act simultaneously, then the turn passes to the other team.
 */
const advanceBattleTick = (units, currentTeam, turnNumber) => {
    const snapshot = cloneUnits(units);
    const hits = [];
    const hitEvents = [];
    const moves = [];
    let hitSequence = 0;
    const recordHitEvent = (attacker, target, attackType, didKill) => {
        const cellKey = `${target.position.row}-${target.position.col}`;
        hits.push(cellKey);
        hitEvents.push({
            // Include turnNumber to ensure unique IDs across turns
            id: `turn${turnNumber}-${attacker.instanceId}-${target.instanceId ?? 'unknown'}-${hitSequence += 1}`,
            attackerId: attacker.instanceId,
            attackerTeam: attacker.team,
            attackerPosition: { ...attacker.position },
            targetId: target.instanceId,
            targetPosition: { ...target.position },
            attackType,
            didKill
        });
    };
    // Collect and apply all actions for the current team simultaneously
    const actions = collectTeamActions(currentTeam, snapshot);
    applyActions(actions, snapshot, (key) => moves.push(key), recordHitEvent);
    // Check for winner after actions
    const winner = evaluateWinner(snapshot);
    // Prepare for next turn (switch teams)
    const nextTeam = otherTeam(currentTeam);
    const nextTurnNumber = turnNumber + 1;
    return {
        units: snapshot,
        hits,
        hitEvents,
        moves,
        winner,
        currentTeam: nextTeam,
        turnNumber: nextTurnNumber
    };
};
exports.advanceBattleTick = advanceBattleTick;
/** Creates the initial battle state with a lucky draw to determine starting team */
const initializeBattle = (units) => {
    const startingTeam = (0, exports.luckyDraw)();
    return {
        units: cloneUnits(units),
        currentTeam: startingTeam,
        turnNumber: 1
    };
};
exports.initializeBattle = initializeBattle;
const buildEnemyArmy = (template, formation) => formation.map((position, index) => ({
    ...template,
    team: 'enemy',
    position: { ...position },
    instanceId: `enemy-${index}-${Math.random().toString(36).slice(2)}`,
    currentHp: template.hp
}));
exports.buildEnemyArmy = buildEnemyArmy;
