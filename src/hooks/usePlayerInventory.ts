import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchInventory, type PlayerUnitRow } from '../lib/inventoryApi';
import { fromDbUnitTypeId } from '../utils/unitTypeIds';

export type PlayerOwnedUnit = {
  id: string;
  unitTypeId: string;
  baseBehaviorConfig: unknown;
};

export type UsePlayerInventoryResult = {
  loading: boolean;
  error: string | null;
  units: PlayerOwnedUnit[];
  refreshInventory: () => void;
  unitTypeIdByPlayerUnitId: Record<string, string>;
  baseBehaviorByPlayerUnitId: Record<string, unknown>;
};

export function usePlayerInventory(): UsePlayerInventoryResult {
  const { user } = useAuth();
  const [units, setUnits] = useState<PlayerOwnedUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!user) {
        if (!isMounted) return;
        setUnits([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const rows: PlayerUnitRow[] = await fetchInventory(user.id);
        if (!isMounted) return;

        setUnits(
          rows.map((row) => ({
            id: row.id,
            unitTypeId: fromDbUnitTypeId(row.unit_type_id),
            baseBehaviorConfig: row.base_behavior_config
          }))
        );
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load inventory');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [refreshIndex, user]);

  const refreshInventory = useCallback(() => {
    setRefreshIndex((i) => i + 1);
  }, []);

  const unitTypeIdByPlayerUnitId = useMemo(() => {
    return units.reduce((acc, u) => {
      acc[u.id] = u.unitTypeId;
      return acc;
    }, {} as Record<string, string>);
  }, [units]);

  const baseBehaviorByPlayerUnitId = useMemo(() => {
    return units.reduce((acc, u) => {
      acc[u.id] = u.baseBehaviorConfig;
      return acc;
    }, {} as Record<string, unknown>);
  }, [units]);

  return { loading, error, units, refreshInventory, unitTypeIdByPlayerUnitId, baseBehaviorByPlayerUnitId };
}
