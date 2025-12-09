import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Unit } from '../types';

export type UnitCatalogEntry = Unit & {
  description?: string | null;
  shield?: number;
  creditCost: number;
  reviveCost: number;
  supplyCost: number;
};

type RawUnitStats = {
  hp: number | null;
  defense: number | null;
  shield: number | null;
  damage: number | null;
  movement_range: number | null;
};

type RawUnitTypeRow = {
  id: string;
  display_name: string;
  description?: string | null;
  base_supply_cost: number | null;
  base_credit_cost: number | null;
  base_revive_cost: number | null;
  rules_version: string;
  unit_type_stats: RawUnitStats | RawUnitStats[] | null;
};

const ICON_MAP: Record<string, string> = {
  recruit: '🎖️',
  knight: '🗡️',
  archer: '🏹',
  zombie: '🧟',
  beast: '🪨',
  mage: '✨',
  giant: '🗿'
};

const coerceStats = (stats: RawUnitTypeRow['unit_type_stats']): RawUnitStats => {
  if (!stats) return { hp: 0, defense: 0, shield: 0, damage: 0, movement_range: 0 };
  if (Array.isArray(stats)) return stats[0] ?? { hp: 0, defense: 0, shield: 0, damage: 0, movement_range: 0 };
  return stats;
};

const mapRowToUnit = (row: RawUnitTypeRow): UnitCatalogEntry => {
  const stats = coerceStats(row.unit_type_stats);
  const iconKey = row.id.toLowerCase();

  return {
    id: row.id,
    name: row.display_name,
    icon: ICON_MAP[iconKey] ?? row.display_name.charAt(0),
    cost: row.base_supply_cost ?? 0,
    hp: stats.hp ?? 0,
    damage: stats.damage ?? 0,
    defense: stats.defense ?? 0,
    shield: stats.shield ?? 0,
    speed: stats.movement_range ?? 0,
    range: stats.movement_range ?? 0,
    behaviorOptions: [],
    upgradeOptions: [],
    description: row.description ?? '',
    creditCost: row.base_credit_cost ?? 0,
    reviveCost: row.base_revive_cost ?? 0,
    supplyCost: row.base_supply_cost ?? 0
  };
};

export const useUnitCatalog = () => {
  const [units, setUnits] = useState<UnitCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUnits = async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('unit_types')
        .select(
          `
            id,
            display_name,
            description,
            base_supply_cost,
            base_credit_cost,
            base_revive_cost,
            rules_version,
            unit_type_stats!inner (
              hp,
              defense,
              shield,
              damage,
              movement_range
            )
          `
        )
        .eq('rules_version', 'v1.0.0');

      if (!isMounted) return;

      if (fetchError) {
        setError(fetchError.message);
        setUnits([]);
        setLoading(false);
        return;
      }

      const mapped = (data ?? []).map(mapRowToUnit);
      setUnits(mapped);
      setError(null);
      setLoading(false);
    };

    loadUnits();

    return () => {
      isMounted = false;
    };
  }, []);

  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => a.name.localeCompare(b.name));
  }, [units]);

  return { units: sortedUnits, loading, error };
};
