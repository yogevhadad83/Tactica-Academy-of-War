import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMultiplayer } from '../context/MultiplayerContext';
import { useUnitCatalog } from '../hooks/useUnitCatalog';
import { getBattlePlan, saveBattlePlan } from '../game/battlePlanStorage';
import type { BattlePlan } from '../game/battlePlan';
import type { ArmyUnitInstance, BoardPlacements, PlacedUnit, UnitLogic } from '../types';
import BoardSetupPanel from '../components/BoardSetupPanel';
import StampButton from '../components/ui/StampButton';
import { usePlayerInventory } from '../hooks/usePlayerInventory';
import { ensureActiveArmy } from '../lib/activeArmy';
import { movePlacedUnit, placeUnit, unplaceByPlayerUnitId } from '../lib/inventoryApi';
import { placementToArmyConfig } from '../utils/placementToArmyConfig';
import './WarRoom.css';

const MAX_SUPPLY = 20;

const looksLikeUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const WarRoom = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userIdOrNull = user?.id ?? null;
  const { units: catalogUnits } = useUnitCatalog();
  const {
    units: inventoryUnits,
    loading: inventoryLoading,
    unitTypeIdByPlayerUnitId
  } = usePlayerInventory();
  const { 
    status: multiplayerStatus,
    lastResult: multiplayerResult,
    startDemoBattle,
  } = useMultiplayer();
  
  const [placements, setPlacements] = useState<BoardPlacements>({});
  const [unitLogic, setUnitLogic] = useState<UnitLogic>({});
  const [supplyError, setSupplyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeArmyId, setActiveArmyId] = useState<string | null>(null);
  const [loadedPlanPlacements, setLoadedPlanPlacements] = useState<PlacedUnit[]>([]);
  const [testingPlan, setTestingPlan] = useState(false);
  const prevPlacementsRef = useRef<BoardPlacements | null>(null);

  const reloadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const plan = await getBattlePlan(userIdOrNull);
      console.log('[WarRoom] Loaded battle plan:', plan);
      if (plan) {
        setLoadedPlanPlacements(plan.placements ?? []);
        const placementsMap: BoardPlacements = {};
        plan.placements.forEach((unit) => {
          placementsMap[unit.instanceId] = unit.position;
        });
        console.log('[WarRoom] Placements map:', placementsMap);
        setPlacements(placementsMap);

        if (plan.unitBehaviors) {
          setUnitLogic(plan.unitBehaviors);
        }
      } else {
        setLoadedPlanPlacements([]);
      }
    } catch (error) {
      console.error('Failed to load battle plan:', error);
    } finally {
      setLoading(false);
    }
  }, [userIdOrNull]);

  useEffect(() => {
    reloadPlan();
  }, [reloadPlan]);

  useEffect(() => {
    let mounted = true;
    const loadArmy = async () => {
      if (!userIdOrNull) {
        setActiveArmyId(null);
        return;
      }
      try {
        const army = await ensureActiveArmy(userIdOrNull);
        if (!mounted) return;
        setActiveArmyId(army.id);
      } catch (err) {
        console.error('[WarRoom] Failed to ensure active army:', err);
      }
    };
    loadArmy();
    return () => {
      mounted = false;
    };
  }, [userIdOrNull]);

  const catalogById = useMemo(
    () => new Map(catalogUnits.map((unit) => [unit.id, unit])),
    [catalogUnits]
  );

  const armyInstances = useMemo(() => {
    const inventoryInstances = inventoryUnits
      .map((ownedUnit) => {
        const meta = catalogById.get(ownedUnit.unitTypeId.toLowerCase());
        if (!meta) return null;
        return { ...meta, instanceId: ownedUnit.id } as ArmyUnitInstance;
      })
      .filter(Boolean) as ArmyUnitInstance[];

    const knownInstanceIds = new Set(inventoryInstances.map((i) => i.instanceId));
    const orphanedInstances = (loadedPlanPlacements ?? [])
      .filter((u) => !knownInstanceIds.has(u.instanceId))
      .map((u) => ({ ...u, instanceId: u.instanceId } as ArmyUnitInstance));

    const instances = [...inventoryInstances, ...orphanedInstances];
    console.log('[WarRoom] Army instances:', instances.map((i) => ({ instanceId: i.instanceId, id: i.id })));
    return instances;
  }, [catalogById, inventoryUnits, loadedPlanPlacements]);

  const supplyByUnitType = useMemo(() => {
    return catalogUnits.reduce((acc, unit) => {
      acc[unit.id] = unit.supplyCost ?? unit.cost ?? 0;
      return acc;
    }, {} as Record<string, number>);
  }, [catalogUnits]);

  const resolveSupplyCost = useCallback(
    (unitTypeId: string, instance?: ArmyUnitInstance) =>
      supplyByUnitType[unitTypeId] ?? instance?.supplyCost ?? instance?.cost ?? 0,
    [supplyByUnitType]
  );

  const placedUnits: PlacedUnit[] = useMemo(() => {
    const result = armyInstances
      .map((unit) => {
        const position = placements[unit.instanceId];
        console.log('[WarRoom] Matching unit:', unit.instanceId, 'position:', position);
        if (!position) return null;
        return {
          ...unit,
          position,
          team: 'player' as const,
          currentHp: unit.hp,
          selectedBehaviors: unitLogic[unit.instanceId]
        };
      })
      .filter(Boolean) as PlacedUnit[];
    console.log('[WarRoom] Placed units:', result.length);
    return result;
  }, [armyInstances, placements, unitLogic]);

  const totalSupplyUsed = useMemo(
    () => placedUnits.reduce((sum, unit) => sum + resolveSupplyCost(unit.id, unit), 0),
    [placedUnits, resolveSupplyCost]
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    
    try {
      // Filter out undefined values from unitLogic
      const cleanedBehaviors: Record<string, string[]> = {};
      Object.entries(unitLogic).forEach(([key, value]) => {
        if (value) {
          cleanedBehaviors[key] = value;
        }
      });
      
      const updatedPlan: BattlePlan = {
        version: 1,
        updatedAt: new Date().toISOString(),
        placements: placedUnits,
        unitBehaviors: cleanedBehaviors,
        supplyUsed: totalSupplyUsed
      };
      
      await saveBattlePlan(userIdOrNull, updatedPlan);
      setSaveSuccess(true);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save battle plan:', error);
      alert('Failed to save battle plan. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Sync placements on change (authenticated mode).
  useEffect(() => {
    if (!userIdOrNull || !activeArmyId) {
      prevPlacementsRef.current = placements;
      return;
    }

    const previous = prevPlacementsRef.current;
    prevPlacementsRef.current = placements;
    if (!previous) return;

    const prevKeys = new Set(Object.keys(previous));
    const nextKeys = new Set(Object.keys(placements));

    const removed = Array.from(prevKeys).filter((k) => !nextKeys.has(k));
    const changedOrAdded = Array.from(nextKeys).filter((k) => {
      const prevPos = previous[k];
      const nextPos = placements[k];
      if (!prevPos) return true;
      return prevPos.row !== nextPos.row || prevPos.col !== nextPos.col;
    });

    let cancelled = false;
    const run = async () => {
      try {
        for (const instanceId of removed) {
          if (!looksLikeUuid(instanceId)) continue;
          if (!unitTypeIdByPlayerUnitId[instanceId]) continue;
          await unplaceByPlayerUnitId(activeArmyId, instanceId);
        }

        for (const instanceId of changedOrAdded) {
          if (!looksLikeUuid(instanceId)) continue;
          if (!unitTypeIdByPlayerUnitId[instanceId]) continue;
          const pos = placements[instanceId];
          if (!pos) continue;

          if (previous[instanceId]) {
            await movePlacedUnit({ playerArmyId: activeArmyId, playerUnitId: instanceId, row: pos.row, col: pos.col });
          } else {
            await placeUnit({
              playerArmyId: activeArmyId,
              playerUnitId: instanceId,
              row: pos.row,
              col: pos.col,
              behaviorConfig: unitLogic[instanceId] ?? null,
              unitTypeId: unitTypeIdByPlayerUnitId[instanceId]
            });
          }
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to sync placements';
        setSupplyError(message);
        await reloadPlan();
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeArmyId, placements, reloadPlan, unitLogic, unitTypeIdByPlayerUnitId, userIdOrNull]);

  // Monitor demo battle result and navigate to Battle Theater when it arrives
  useEffect(() => {
    if (!testingPlan || !multiplayerResult) return;
    if (multiplayerResult.battleType !== 'demo') return;

    const timeline = multiplayerResult.timeline ?? [];
    if (!timeline.length) {
      setTestingPlan(false);
      alert('Demo battle did not return a timeline.');
      return;
    }

    const matchId = multiplayerResult.matchId || (typeof crypto !== 'undefined' ? crypto.randomUUID() : `demo-${Date.now()}`);
    const winnerRaw = String(multiplayerResult.winner);
    const winnerSide: 'A' | 'B' | 'draw' = winnerRaw === 'A' || winnerRaw === 'player'
      ? 'A'
      : winnerRaw === 'B' || winnerRaw === 'enemy'
        ? 'B'
        : 'draw';

    setTestingPlan(false);
    navigate(`/battle/${matchId}`, {
      state: {
        mode: 'demo',
        matchId,
        timelineA: timeline,
        timelineB: null,
        winnerSide,
      },
    });
  }, [multiplayerResult, testingPlan, navigate]);

  const handleTestPlan = useCallback(() => {
    if (multiplayerStatus !== 'connected') {
      alert('Connect to the multiplayer server before testing a plan.');
      return;
    }
    if (placedUnits.length === 0) {
      alert('Place at least one unit before testing your plan.');
      return;
    }
    
    console.log('[WarRoom] Starting test plan with', placedUnits.length, 'units');
    setTestingPlan(true);
    const armyConfig = placementToArmyConfig(placedUnits);
    console.log('[WarRoom] Army config to send:', JSON.stringify(armyConfig, null, 2));
    startDemoBattle(armyConfig);
  }, [multiplayerStatus, placedUnits, startDemoBattle]);

  if (loading || inventoryLoading) {
    return (
      <div className="war-room-container">
        <div className="war-room-loading">Loading War Room...</div>
      </div>
    );
  }

  return (
    <div className="war-room-container">
      <header className="war-room-header">
        <div className="war-room-title-section">
          <h1 className="war-room-title">War Room</h1>
          <p className="war-room-subtitle">Configure your battle plan for matchmaking</p>
        </div>
        
        <div className="war-room-status">
          <div className="supply-indicator">
            <span className="supply-label">Supply</span>
            <span className={`supply-value ${totalSupplyUsed > MAX_SUPPLY ? 'over-limit' : ''}`}>
              {totalSupplyUsed} / {MAX_SUPPLY}
            </span>
          </div>
          
          <StampButton 
            onClick={handleTestPlan} 
            disabled={testingPlan || placedUnits.length === 0 || multiplayerStatus !== 'connected'}
          >
            {testingPlan ? 'Testing...' : 'Test Plan'}
          </StampButton>
          
          <StampButton onClick={handleSave} disabled={saving || totalSupplyUsed > MAX_SUPPLY}>
            {saving ? 'Saving...' : 'Save Plan'}
          </StampButton>
          
          {saveSuccess && (
            <span className="save-success">✓ Saved</span>
          )}
        </div>
      </header>

      {supplyError && (
        <div className="war-room-error">
          {supplyError}
        </div>
      )}

      {!user && (
        <div className="war-room-banner">
          ⚠️ Guest mode: Battle plan saved locally. Login to sync across devices.
        </div>
      )}

      <div className="war-room-board">
        <BoardSetupPanel
          mode="pvp"
          armyInstances={armyInstances}
          placements={placements}
          setPlacements={setPlacements}
          unitLogic={unitLogic}
          setUnitLogic={setUnitLogic}
          resolveSupplyCost={resolveSupplyCost}
          totalSupplyUsed={totalSupplyUsed}
          maxSupply={MAX_SUPPLY}
          setSupplyError={setSupplyError}
        />
      </div>

      <div className="war-room-instructions">
        <h3>Instructions</h3>
        <ul>
          <li>Drag units from your roster onto the board</li>
          <li>Click a placed unit to configure its tactical behavior</li>
          <li>Stay within the {MAX_SUPPLY} supply limit</li>
          <li>Save your plan before finding an opponent</li>
        </ul>
      </div>
    </div>
  );
};

export default WarRoom;
