import { supabase } from '../lib/supabaseClient';
import { units as unitTemplates } from '../data/units';
import type { BattlePlan } from './battlePlan';
import type { PlacedUnit } from '../types';
import { PLAYER_ZONE_START } from '../engine/battleEngine';
import { toDbUnitTypeId } from '../utils/unitTypeIds';
import { ensureActiveArmy } from '../lib/activeArmy';

const STORAGE_KEY = 'tactica_battle_plan';
const BOARD_ROWS = 12;
const BOARD_COLS = 6;
const LOG_PREFIX = '[battlePlanStorage]';

const loggedErrors = new Set<string>();
const logErrorOnce = (key: string, error: unknown) => {
  if (loggedErrors.has(key)) return;
  loggedErrors.add(key);
  console.error(`${LOG_PREFIX} ${key}`, error);
};

const isValidPosition = (row: unknown, col: unknown): boolean =>
  Number.isInteger(row) &&
  Number.isInteger(col) &&
  (row as number) >= 0 &&
  (row as number) < BOARD_ROWS &&
  (col as number) >= 0 &&
  (col as number) < BOARD_COLS;

const isPlayerDeploymentRow = (row: number) => row >= PLAYER_ZONE_START && row < BOARD_ROWS;

const parseBehaviors = (raw: unknown): string[] | undefined => {
  if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) return raw as string[];
  if (raw && typeof raw === 'object' && 'behaviors' in (raw as Record<string, unknown>)) {
    const nested = (raw as { behaviors?: unknown }).behaviors;
    if (Array.isArray(nested) && nested.every((item) => typeof item === 'string')) {
      return nested as string[];
    }
  }
  return undefined;
};

const findUnitTemplate = (unitTypeId?: string | null) => {
  if (!unitTypeId) return null;
  const normalized = unitTypeId.toLowerCase();
  return unitTemplates.find((unit) => unit.id.toLowerCase() === normalized) ?? null;
};

const computeSupplyUsed = (placements: PlacedUnit[]) =>
  placements.reduce((sum, unit) => sum + (unit.supplyCost ?? unit.cost ?? 0), 0);

const looksLikeUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/**
 * Get battle plan from localStorage (guest mode)
 */
const getLocalBattlePlan = (): BattlePlan | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:guest`);
    if (!raw) return null;
    
    const parsed = JSON.parse(raw) as Partial<BattlePlan>;
    
    // Validate structure
    if (parsed.version && parsed.updatedAt && Array.isArray(parsed.placements)) {
      return parsed as BattlePlan;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to load local battle plan:', error);
    return null;
  }
};

/**
 * Save battle plan to localStorage (guest mode)
 */
const saveLocalBattlePlan = (plan: BattlePlan): void => {
  if (typeof window === 'undefined') return;
  
  try {
    window.localStorage.setItem(`${STORAGE_KEY}:guest`, JSON.stringify(plan));
  } catch (error) {
    console.error('Failed to save local battle plan:', error);
    throw new Error('Failed to save battle plan locally');
  }
};

/**
 * Get battle plan from Supabase (authenticated mode)
 */
const getRemoteBattlePlan = async (userId: string): Promise<BattlePlan | null> => {
  try {
    const activeArmy = await ensureActiveArmy(userId);

    const { data: unitRows, error: unitsError } = await supabase
      .from('player_army_units')
      .select('id, unit_type_id, player_unit_id, row, col, behavior_config')
      .eq('player_army_id', activeArmy.id);

    if (unitsError) {
      logErrorOnce('Failed to fetch player army units', unitsError);
      return null;
    }

    if (!unitRows || unitRows.length === 0) {
      console.log(`${LOG_PREFIX} No unit rows found for army:`, activeArmy.id);
      return null;
    }

    console.log(`${LOG_PREFIX} Fetched ${unitRows.length} unit rows:`, unitRows);

    const playerUnitIds = (unitRows ?? [])
      .map((row) => (row as { player_unit_id?: string | null }).player_unit_id)
      .filter((id): id is string => Boolean(id));

    const uniquePlayerUnitIds = Array.from(new Set(playerUnitIds));
    const playerUnitsById = new Map<
      string,
      { unit_type_id: string; base_behavior_config: unknown }
    >();

    if (uniquePlayerUnitIds.length) {
      const { data: playerUnitRows, error: playerUnitsError } = await supabase
        .from('player_units')
        .select('id, unit_type_id, base_behavior_config')
        .in('id', uniquePlayerUnitIds);

      if (playerUnitsError) {
        logErrorOnce('Failed to fetch player_units for placements', playerUnitsError);
      }

      (playerUnitRows ?? []).forEach((row) => {
        playerUnitsById.set(row.id, {
          unit_type_id: row.unit_type_id,
          base_behavior_config: row.base_behavior_config
        });
      });
    }

    const placements: PlacedUnit[] = [];
    const unitBehaviors: Record<string, string[]> = {};

    for (const row of unitRows) {
      console.log(`${LOG_PREFIX} Processing row:`, row);
      console.log(`${LOG_PREFIX} row.row type:`, typeof row.row, 'value:', row.row);
      console.log(`${LOG_PREFIX} row.col type:`, typeof row.col, 'value:', row.col);
      
      if (!isValidPosition(row.row, row.col)) {
        console.log(`${LOG_PREFIX} Invalid position:`, { row: row.row, col: row.col });
        continue;
      }

      if (!isPlayerDeploymentRow(row.row)) {
        console.log(`${LOG_PREFIX} Not in player deployment zone:`, { row: row.row, PLAYER_ZONE_START });
        continue;
      }

      const linkedPlayerUnitId = (row as { player_unit_id?: string | null }).player_unit_id ?? null;
      const linkedPlayerUnit = linkedPlayerUnitId ? playerUnitsById.get(linkedPlayerUnitId) ?? null : null;

      const resolvedUnitTypeId =
        linkedPlayerUnit?.unit_type_id ??
        (row as { unit_type_id?: string; unit_type?: string }).unit_type_id ??
        (row as { unit_type?: string }).unit_type;

      const template = findUnitTemplate(resolvedUnitTypeId);
      if (!template) {
        console.log(`${LOG_PREFIX} No template found for unit_type_id:`, resolvedUnitTypeId);
        continue;
      }

      const placementBehaviors = parseBehaviors((row as { behavior_config?: unknown }).behavior_config);
      const baseBehaviors = parseBehaviors(linkedPlayerUnit?.base_behavior_config);
      const behaviors = placementBehaviors ?? baseBehaviors;

      const instanceId = linkedPlayerUnitId ?? row.id;
      if (behaviors && behaviors.length) {
        unitBehaviors[instanceId] = behaviors;
      }

      placements.push({
        ...template,
        instanceId,
        position: { row: row.row, col: row.col },
        team: 'player',
        currentHp: template.hp,
        selectedBehaviors: behaviors
      });
    }

    console.log(`${LOG_PREFIX} Loaded ${placements.length} placements`);

    if (!placements.length) {
      console.log(`${LOG_PREFIX} No valid placements found after filtering`);
      return null;
    }

    const supplyUsed = computeSupplyUsed(placements);
    const updatedAt = activeArmy.updated_at ?? new Date().toISOString();

    return {
      version: 1,
      updatedAt,
      placements,
      unitBehaviors: Object.keys(unitBehaviors).length ? unitBehaviors : undefined,
      supplyUsed
    };
  } catch (error) {
    logErrorOnce('Failed to load remote battle plan', error);
    return null;
  }
};

/**
 * Save battle plan to Supabase (authenticated mode)
 */
const saveRemoteBattlePlan = async (userId: string, plan: BattlePlan): Promise<void> => {
  try {
    const activeArmy = await ensureActiveArmy(userId);
    console.log(`${LOG_PREFIX} Saving to army:`, activeArmy.id);
    console.log(`${LOG_PREFIX} Plan has ${plan.placements.length} placements:`, plan.placements);

    // Create mapping of unit index to behaviors for later use
    const unitIndexToBehaviors = new Map<number, string[] | undefined>();
    const rows = plan.placements
      .filter((unit) => {
        const valid = isValidPosition(unit.position?.row, unit.position?.col) && isPlayerDeploymentRow(unit.position.row);
        if (!valid) {
          console.log(`${LOG_PREFIX} Filtering out unit with invalid position:`, unit.position);
        }
        return valid;
      })
      .map((unit, index) => {
        const behaviors = plan.unitBehaviors?.[unit.instanceId] ?? unit.selectedBehaviors;
        unitIndexToBehaviors.set(index, behaviors);

        const playerUnitId = looksLikeUuid(unit.instanceId) ? unit.instanceId : null;
        return {
          player_army_id: activeArmy.id,
          unit_type_id: toDbUnitTypeId(unit.id),
          player_unit_id: playerUnitId,
          row: unit.position.row,
          col: unit.position.col,
          behavior_config: behaviors && behaviors.length ? behaviors : null
        };
      });

    console.log(`${LOG_PREFIX} Saving ${rows.length} units:`, rows);

    const { error: deleteError } = await supabase
      .from('player_army_units')
      .delete()
      .eq('player_army_id', activeArmy.id);

    if (deleteError) {
      console.error(`${LOG_PREFIX} Delete error:`, deleteError);
      throw deleteError;
    }

    if (rows.length) {
      // Insert with behavior_config already set - Supabase will handle the ID generation
      const { error: insertError, data: insertedRows } = await supabase
        .from('player_army_units')
        .insert(rows)
        .select('id, unit_type_id, row, col, behavior_config');

      if (insertError) {
        console.error(`${LOG_PREFIX} Insert error:`, insertError);
        throw insertError;
      }

      console.log(`${LOG_PREFIX} Inserted ${insertedRows?.length ?? 0} rows:`, insertedRows);
    }

    const { error: updateError } = await supabase
      .from('player_armies')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', activeArmy.id);

    if (updateError) {
      console.error(`${LOG_PREFIX} Update timestamp error:`, updateError);
      throw updateError;
    }

    console.log(`${LOG_PREFIX} Save complete`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save remote battle plan:`, error);
    throw error;
  }
};

/**
 * Get the current battle plan for a user (or guest)
 * @param userIdOrNull - User ID if authenticated, null for guest mode
 * @returns Battle plan or null if none exists
 */
export const getBattlePlan = async (userIdOrNull: string | null): Promise<BattlePlan | null> => {
  if (!userIdOrNull) {
    // Guest mode - use localStorage
    return getLocalBattlePlan();
  }
  
  // Authenticated mode - use Supabase
  return await getRemoteBattlePlan(userIdOrNull);
};

/**
 * Save a battle plan for a user (or guest)
 * @param userIdOrNull - User ID if authenticated, null for guest mode
 * @param plan - The battle plan to save
 */
export const saveBattlePlan = async (userIdOrNull: string | null, plan: BattlePlan): Promise<void> => {
  // Update timestamp
  const planWithTimestamp: BattlePlan = {
    ...plan,
    updatedAt: new Date().toISOString()
  };
  
  if (!userIdOrNull) {
    // Guest mode - use localStorage
    saveLocalBattlePlan(planWithTimestamp);
    return;
  }
  
  // Authenticated mode - use Supabase
  await saveRemoteBattlePlan(userIdOrNull, planWithTimestamp);
};

/**
 * Check if a battle plan exists for a user (or guest)
 * @param userIdOrNull - User ID if authenticated, null for guest mode
 * @returns true if a non-empty battle plan exists
 */
export const hasBattlePlan = async (userIdOrNull: string | null): Promise<boolean> => {
  const plan = await getBattlePlan(userIdOrNull);
  return plan !== null && plan.placements.length > 0;
};
