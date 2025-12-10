import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { calculateArmyCost, getUnitCost } from '../utils/credits';

export type PlayerArmyUnit = {
  id: string;
  slotIndex: number;
  unitTypeId: string;
};

export type UsePlayerArmyResult = {
  loading: boolean;
  error: string | null;
  armyId: string | null;
  units: PlayerArmyUnit[];
  totalCreditCost: number;
  addUnit: (unitTypeId: string) => Promise<void>;
  removeUnit: (unitInstanceId: string) => Promise<void>;
  clearArmy: () => Promise<void>;
  refreshArmy: () => void;
};

type UsePlayerArmyOptions = {
  availableCredits?: number | null;
};

export function usePlayerArmy(options: UsePlayerArmyOptions = {}): UsePlayerArmyResult {
  const { user } = useAuth();
  const [armyId, setArmyId] = useState<string | null>(null);
  const [units, setUnits] = useState<PlayerArmyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const usedSlots = useMemo(() => new Set(units.map((u) => u.slotIndex)), [units]);
  const totalCreditCost = useMemo(() => calculateArmyCost(units), [units]);

  useEffect(() => {
    let isMounted = true;

    const loadArmy = async () => {
      if (!user) {
        if (!isMounted) return;
        setArmyId(null);
        setUnits([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data: armies, error: armiesError } = await supabase
        .from('player_armies')
        .select('id')
        .eq('player_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1);

      if (!isMounted) return;

      if (armiesError) {
        setError(armiesError.message);
        setLoading(false);
        return;
      }

      let nextArmyId: string;

      if (!armies || armies.length === 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('player_armies')
          .insert({
            player_id: user.id,
            name: 'Default Army',
            is_favorite: true
          })
          .select('id')
          .single();

        if (!isMounted) return;

        if (insertError || !inserted) {
          setError(insertError?.message ?? 'Failed to create army');
          setLoading(false);
          return;
        }

        nextArmyId = inserted.id;
      } else {
        nextArmyId = armies[0].id;
      }

      const { data: unitRows, error: unitsError } = await supabase
        .from('player_army_units')
        .select('id, unit_type_id, row, col')
        .eq('player_army_id', nextArmyId)
        .order('row', { ascending: true })
        .order('col', { ascending: true });

      if (!isMounted) return;

      if (unitsError) {
        setArmyId(nextArmyId);
        setError(unitsError.message);
        setLoading(false);
        return;
      }

      const mappedUnits = (unitRows ?? []).map((row) => ({
        id: row.id,
        slotIndex: row.col,
        unitTypeId: row.unit_type_id
      }));

      setArmyId(nextArmyId);
      setUnits(mappedUnits);
      setLoading(false);
    };

    loadArmy();

    return () => {
      isMounted = false;
    };
  }, [user, refreshIndex]);

  const addUnit = async (unitTypeId: string) => {
    if (!armyId || !user) return;
    if (units.length >= 20) return;

    let slotIndex = 0;
    while (usedSlots.has(slotIndex) && slotIndex < 20) slotIndex += 1;
    if (slotIndex >= 20) return;

    const unitCost = getUnitCost(unitTypeId);
    const creditBudget = options.availableCredits;

    // Early client-side guard using the latest known credits
    if (typeof creditBudget === 'number' && unitCost > creditBudget) {
      setError('Not enough credits for this unit');
      return;
    }

    // Server-side guarded deduction: ensure the wallet has enough before charging
    const { data: playerRow, error: fetchCreditsError } = await supabase
      .from('players')
      .select('current_credits')
      .eq('id', user.id)
      .single();

    if (fetchCreditsError) {
      setError(fetchCreditsError.message);
      return;
    }

    const currentCredits = playerRow?.current_credits ?? 0;
    if (currentCredits < unitCost) {
      setError('Not enough credits for this unit');
      return;
    }

    const nextCredits = currentCredits - unitCost;
    const { data: debitRows, error: updateCreditsError } = await supabase
      .from('players')
      .update({ current_credits: nextCredits })
      .eq('id', user.id)
      .gte('current_credits', unitCost)
      .select('current_credits')
      .maybeSingle();

    if (updateCreditsError || !debitRows) {
      setError(updateCreditsError?.message ?? 'Not enough credits for this unit');
      return;
    }

    const { data, error: insertError } = await supabase
      .from('player_army_units')
      .insert({
        player_army_id: armyId,
        unit_type_id: unitTypeId,
        row: 0,
        col: slotIndex,
        behavior_config: null
      })
      .select('id, unit_type_id, row, col')
      .single();

    if (insertError || !data) {
      // Refund credits if the insert fails
      await supabase
        .from('players')
        .update({ current_credits: currentCredits })
        .eq('id', user.id);

      setError(insertError?.message ?? 'Failed to add unit');
      return;
    }

    // Clear any previous errors on success
    setError(null);

    setUnits((prev) => [
      ...prev,
      {
        id: data.id,
        slotIndex: data.col,
        unitTypeId: data.unit_type_id
      }
    ]);
  };

  const removeUnit = async (unitInstanceId: string) => {
    const { error: deleteError } = await supabase
      .from('player_army_units')
      .delete()
      .eq('id', unitInstanceId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setUnits((prev) => prev.filter((unit) => unit.id !== unitInstanceId));
  };

  const clearArmy = async () => {
    if (!armyId) return;

    const { error: deleteError } = await supabase
      .from('player_army_units')
      .delete()
      .eq('player_army_id', armyId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setUnits([]);
  };

  const refreshArmy = useCallback(() => {
    setRefreshIndex((index) => index + 1);
  }, []);

  return { loading, error, armyId, units, totalCreditCost, addUnit, removeUnit, clearArmy, refreshArmy };
}
