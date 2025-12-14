import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { ArmyUnitInstance, Unit } from '../types';
import { useAuth } from '../context/AuthContext';
import { usePlayerContext } from '../context/PlayerContext';
import './ArmyBuilder.css';
import UnitPreviewCanvas from '../components/UnitPreviewCanvas';
import { useUnitCatalog } from '../hooks/useUnitCatalog';
import { usePlayerArmy } from '../hooks/usePlayerArmy';
import { calculateArmyCost } from '../utils/credits';
import { supabase } from '../lib/supabaseClient';
import { applyOptimisticWallet, type WalletSyncHandle } from '../utils/walletSync';

const maxUnits = 20;

type BoardVector = { row: number; col: number };
type MovementBlueprint = {
  moves: BoardVector[];
  attacks: BoardVector[];
  description: {
    movement: string;
    attack: string;
  };
};

const BOARD_ROWS = 5;
const BOARD_COLS = 5;
const BOARD_ORIGIN = { row: BOARD_ROWS - 1, col: Math.floor(BOARD_COLS / 2) };

const MOVEMENT_BLUEPRINTS: Record<string, MovementBlueprint> = {
  default: {
    moves: [{ row: -1, col: 0 }],
    attacks: [{ row: -1, col: 0 }],
    description: {
      movement: 'Steps forward to pressure the frontline.',
      attack: 'Strikes the closest foe straight ahead.'
    }
  },
  knight: {
    moves: [{ row: -1, col: 0 }],
    attacks: [{ row: -1, col: 0 }],
    description: {
      movement: 'Knights advance one tile to engage quickly.',
      attack: 'Blade reaches the immediate tile in front.'
    }
  },
  beast: {
    moves: [
      { row: -1, col: 0 },
      { row: -1, col: -1 },
      { row: -1, col: 1 }
    ],
    attacks: [{ row: -1, col: 0 }],
    description: {
      movement: 'Beasts lumber forward and can lean into flanks.',
      attack: 'Crushing blow lands on the path directly ahead.'
    }
  },
  mage: {
    moves: [{ row: -1, col: 0 }],
    attacks: [
      { row: -1, col: 0 },
      { row: -1, col: -1 },
      { row: -1, col: 1 }
    ],
    description: {
      movement: 'Mages advance cautiously while keeping distance.',
      attack: 'Casts a short arc of spells in front.'
    }
  },
  giant: {
    moves: [
      { row: -1, col: 0 },
      { row: -1, col: -1 },
      { row: -1, col: 1 }
    ],
    attacks: [{ row: -1, col: 0 }],
    description: {
      movement: 'Giants stride forward and threaten nearby tiles.',
      attack: 'Massive swings crush foes directly ahead.'
    }
  },
  zombie: {
    moves: [{ row: -1, col: 0 }],
    attacks: [{ row: -1, col: 0 }],
    description: {
      movement: 'Shambling advance with relentless pace.',
      attack: 'Claws at the nearest enemy in reach.'
    }
  },
  recruit: {
    moves: [{ row: -1, col: 0 }],
    attacks: [{ row: -1, col: 0 }],
    description: {
      movement: 'New recruits step forward to hold the line.',
      attack: 'Strikes the closest foe straight ahead.'
    }
  },
  archer: {
    moves: [{ row: -1, col: 0 }],
    attacks: [
      { row: -1, col: 0 },
      { row: -2, col: 0 },
      { row: -3, col: 0 },
      { row: -4, col: 0 }
    ],
    description: {
      movement: 'Archers step forward to secure a firing lane.',
      attack: 'Arrows arc across every tile in front within range.'
    }
  }
};

const createTempUnitId = () => `temp-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

const translateVectors = (vectors: BoardVector[]) =>
  vectors
    .map((vec) => ({
      row: BOARD_ORIGIN.row + vec.row,
      col: BOARD_ORIGIN.col + vec.col
    }))
    .filter((pos) => pos.row >= 0 && pos.row < BOARD_ROWS && pos.col >= 0 && pos.col < BOARD_COLS);

const boardKey = (pos: { row: number; col: number }) => `${pos.row}-${pos.col}`;

const MiniBoard = ({ unit }: { unit: Unit | null }) => {
  const blueprint = unit ? MOVEMENT_BLUEPRINTS[unit.id] ?? MOVEMENT_BLUEPRINTS.default : MOVEMENT_BLUEPRINTS.default;
  const movePositions = translateVectors(blueprint.moves);
  const attackPositions = translateVectors(blueprint.attacks);
  const originKey = boardKey(BOARD_ORIGIN);
  const moveKeys = new Set(movePositions.map(boardKey));
  const attackKeys = new Set(attackPositions.map(boardKey));

  const cells = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const key = boardKey({ row, col });
      const isOrigin = key === originKey;
      const canMove = moveKeys.has(key);
      const canAttack = attackKeys.has(key);
      const cellClass = [
        'mini-board__cell',
        (row + col) % 2 === 0 ? 'mini-board__cell--light' : 'mini-board__cell--dark',
        isOrigin ? 'mini-board__cell--origin' : '',
        canMove ? 'mini-board__cell--move' : '',
        canAttack ? 'mini-board__cell--attack' : '',
        canMove && canAttack ? 'mini-board__cell--focus' : ''
      ]
        .filter(Boolean)
        .join(' ');

      cells.push(
        <div key={key} className={cellClass}>
          {isOrigin ? '●' : ''}
        </div>
      );
    }
  }

  return (
    <>
      <div className="mini-board" aria-label="Unit movement and attack preview">
        {cells}
      </div>
      <div className="mini-board__legend">
        <span className="mini-board__legend-item">
          <span className="mini-board__legend-dot mini-board__legend-dot--move" /> Move arc
        </span>
        <span className="mini-board__legend-item">
          <span className="mini-board__legend-dot mini-board__legend-dot--attack" /> Attack reach
        </span>
        <span className="mini-board__legend-item">
          <span className="mini-board__legend-dot mini-board__legend-dot--origin" /> Current unit
        </span>
      </div>
      <div className="mini-board__note">
        <p>{blueprint.description.movement}</p>
        <p>{blueprint.description.attack}</p>
      </div>
    </>
  );
};

type CollapsibleSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

const CollapsibleSection = ({ title, description, children, defaultOpen = false }: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`collapsible-section ${isOpen ? 'open' : ''}`}>
      <button
        className="collapsible-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        type="button"
      >
        <span>{title}</span>
        <span className="chevron" aria-hidden="true" />
      </button>
      {description && <p className="collapsible-description">{description}</p>}
      {isOpen && <div className="collapsible-body">{children}</div>}
    </section>
  );
};

type ToastMessage = {
  id: number;
  variant: 'success' | 'error';
  title: string;
  detail?: string;
};

const TplToast = ({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) => {
  if (!toast) return null;
  return (
    <div className="tpl-toast-layer">
      <div className={`tpl-toast tpl-toast--${toast.variant}`} role="status" aria-live="polite">
        <div>
          <p className="tpl-toast__title">{toast.title}</p>
          {toast.detail && <p className="tpl-toast__body">{toast.detail}</p>}
        </div>
        <button type="button" className="tpl-toast__close" onClick={onDismiss} aria-label="Dismiss notification">
          Dismiss
        </button>
      </div>
    </div>
  );
};

const ArmyBuilder = () => {
  const { user } = useAuth();
  const { player, loading: playerLoading, refresh: refreshPlayer, setPlayerCredits } = usePlayerContext();
  const { units: catalogUnits, loading: unitsLoading, error: unitsError } = useUnitCatalog();
  const {
    loading: armyLoading,
    error: armyError,
    armyId,
    units: armyUnits,
    refreshArmy
  } = usePlayerArmy();
  const [draftUnits, setDraftUnits] = useState(armyUnits);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [cartSuccess, setCartSuccess] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [pendingCredits, setPendingCredits] = useState<number | null>(null);
  const [isWalletSyncing, setIsWalletSyncing] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [activeUnitId, setActiveUnitId] = useState<string>('');

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);
  useEffect(() => {
    setDraftUnits(armyUnits.map((unit) => ({ ...unit })));
    setHasUnsavedChanges(false);
  }, [armyUnits]);

  useEffect(() => {
    if (pendingCredits === null) return;
    if (player?.current_credits === pendingCredits) {
      setPendingCredits(null);
      setIsWalletSyncing(false);
      setCartSuccess('Army updated successfully.');
    } else {
      setIsWalletSyncing(true);
    }
  }, [pendingCredits, player]);

  useEffect(() => {
    if (!cartSuccess || isWalletSyncing) return undefined;
    const timeout = setTimeout(() => setCartSuccess(null), 4000);
    return () => clearTimeout(timeout);
  }, [cartSuccess, isWalletSyncing]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const catalogById = useMemo(() => new Map(catalogUnits.map((unit) => [unit.id, unit])), [catalogUnits]);

  const armyUnitsWithMeta = useMemo(
    () =>
      draftUnits
        .map((armyUnit) => {
          const meta = catalogById.get(armyUnit.unitTypeId.toLowerCase());
          if (!meta) return null;
          return {
            ...meta,
            instanceId: armyUnit.id,
            slotIndex: armyUnit.slotIndex
          } as ArmyUnitInstance & { slotIndex: number };
        })
        .filter(Boolean) as (ArmyUnitInstance & { slotIndex: number })[],
    [draftUnits, catalogById]
  );

  useEffect(() => {
    if (!catalogUnits.length) return;
    setActiveUnitId((prev) => (prev ? prev : catalogUnits[0].id));
  }, [catalogUnits]);

  const activeUnit = useMemo(
    () => catalogUnits.find((unit) => unit.id === activeUnitId) ?? catalogUnits[0] ?? null,
    [activeUnitId, catalogUnits]
  );

  const statCards = useMemo(
    () => [
      {
        id: 'hp',
        label: 'HP',
        value: activeUnit ? activeUnit.hp : '—',
        suffix: '',
        icon: '❤️'
      },
      {
        id: 'defense',
        label: 'Defense',
        value: activeUnit ? activeUnit.defense : '—',
        suffix: '',
        icon: '🛡️'
      },
      {
        id: 'shield',
        label: 'Shield',
        value: activeUnit ? activeUnit.shield ?? 0 : '—',
        suffix: '',
        icon: '🧊'
      },
      {
        id: 'damage',
        label: 'Damage',
        value: activeUnit ? activeUnit.damage : '—',
        suffix: '',
        icon: '⚔️'
      },
      {
        id: 'creditCost',
        label: 'Cost',
        value: activeUnit ? `${activeUnit.creditCost} credits` : '—',
        suffix: '',
        icon: '💰'
      },
      {
        id: 'supplyCost',
        label: 'Supply',
        value: activeUnit ? activeUnit.supplyCost : '—',
        suffix: '',
        icon: '📦'
      }
    ],
    [activeUnit]
  );

  const unitLimitReached = draftUnits.length >= maxUnits;
  const canModify = Boolean(user && armyId);
  const playerCredits = player?.current_credits ?? null;

  const pendingAdditions = useMemo(
    () => draftUnits.filter((unit) => !armyUnits.some((base) => base.id === unit.id)),
    [draftUnits, armyUnits]
  );
  const pendingRemovals = useMemo(
    () => armyUnits.filter((unit) => !draftUnits.some((draft) => draft.id === unit.id)),
    [draftUnits, armyUnits]
  );
  const creditsToSpend = useMemo(() => calculateArmyCost(pendingAdditions), [pendingAdditions]);
  const creditsToRefund = useMemo(() => calculateArmyCost(pendingRemovals), [pendingRemovals]);
  const netCreditChange = creditsToSpend - creditsToRefund;
  const projectedCredits = playerCredits !== null ? playerCredits - netCreditChange : null;
  const draftTotalCredits = useMemo(() => calculateArmyCost(draftUnits), [draftUnits]);

  const getNextSlotIndex = useCallback(() => {
    const occupied = new Set(draftUnits.map((unit) => unit.slotIndex));
    let candidate = 0;
    while (occupied.has(candidate) && candidate < maxUnits) {
      candidate += 1;
    }
    return candidate;
  }, [draftUnits]);

  const handleAddUnitToDraft = useCallback(
    (unitTypeId: string) => {
      if (!canModify) return;
      const slotIndex = getNextSlotIndex();
      if (slotIndex >= maxUnits) return;
      setDraftUnits((prev) => [
        ...prev,
        {
          id: createTempUnitId(),
          slotIndex,
          unitTypeId
        }
      ]);
      setHasUnsavedChanges(true);
      setCartError(null);
      setCartSuccess(null);
    },
    [canModify, getNextSlotIndex]
  );

  const handleRemoveDraftUnit = useCallback((unitId: string) => {
    setDraftUnits((prev) => prev.filter((unit) => unit.id !== unitId));
    setHasUnsavedChanges(true);
    setCartError(null);
    setCartSuccess(null);
  }, []);

  const handleClearDraft = useCallback(() => {
    setDraftUnits([]);
    setHasUnsavedChanges(true);
    setCartError(null);
    setCartSuccess(null);
  }, []);

  const handleDiscardChanges = useCallback(() => {
    setDraftUnits(armyUnits.map((unit) => ({ ...unit })));
    setHasUnsavedChanges(false);
    setCartError(null);
    setCartSuccess(null);
  }, [armyUnits]);

  const handleApplyChanges = useCallback(async () => {
    if (!player || !armyId) {
      setCartError('Login to save your army.');
      return;
    }
    if (!hasUnsavedChanges) return;

    const currentCredits = player.current_credits ?? 0;
    if (netCreditChange > currentCredits) {
      setCartError('Not enough credits to finalize this purchase.');
      return;
    }

    setIsApplying(true);
    setCartError(null);
    setCartSuccess(null);
    setToast(null);

    const nextCredits = currentCredits - netCreditChange;
    let walletHandle: WalletSyncHandle | null = null;

    if (netCreditChange !== 0) {
      walletHandle = applyOptimisticWallet({
        previousCredits: currentCredits,
        nextCredits,
        setPlayerCredits,
        setPendingCredits,
        setIsWalletSyncing
      });
    }

    try {
      if (pendingRemovals.length) {
        const { error: deleteError } = await supabase
          .from('player_army_units')
          .delete()
          .in('id', pendingRemovals.map((unit) => unit.id));
        if (deleteError) {
          throw deleteError;
        }
      }

      if (pendingAdditions.length) {
        const insertPayload = pendingAdditions.map((unit) => ({
          player_army_id: armyId,
          unit_type_id: unit.unitTypeId,
          row: 0,
          col: unit.slotIndex,
          behavior_config: null
        }));

        const { error: insertError } = await supabase
          .from('player_army_units')
          .insert(insertPayload);

        if (insertError) {
          throw insertError;
        }
      }

      if (netCreditChange !== 0) {
        const { error: creditError } = await supabase
          .from('players')
          .update({ current_credits: nextCredits })
          .eq('id', player.id);

        if (creditError) {
          throw creditError;
        }
      }

      refreshArmy();
      refreshPlayer();
      setHasUnsavedChanges(false);

      if (netCreditChange !== 0) {
        setCartSuccess('Army updated successfully. Wallet syncing…');
      } else {
        setCartSuccess('Army updated successfully.');
        setPendingCredits(null);
        setIsWalletSyncing(false);
      }

      setToast({
        id: Date.now(),
        variant: 'success',
        title: 'Army updated',
        detail: netCreditChange !== 0 ? 'Wallet syncing in the background.' : 'Loadout saved successfully.'
      });
    } catch (err) {
      walletHandle?.rollback();
      setPendingCredits(null);
      setIsWalletSyncing(false);
      const message = err instanceof Error ? err.message : 'Failed to update army';
      setCartError(message);
      setCartSuccess(null);
      setToast({
        id: Date.now(),
        variant: 'error',
        title: 'Army update failed',
        detail: message || 'Previous credits restored. Please try again.'
      });
      refreshArmy();
      refreshPlayer();
    } finally {
      setIsApplying(false);
    }
  }, [
    player,
    armyId,
    hasUnsavedChanges,
    netCreditChange,
    pendingRemovals,
    pendingAdditions,
    refreshArmy,
    refreshPlayer,
    setPlayerCredits,
    setPendingCredits,
    setIsWalletSyncing,
    setToast
  ]);

  const addActiveUnit = () => {
    if (!activeUnit) return;
    handleAddUnitToDraft(activeUnit.id);
  };

  const addDisabled =
    !canModify ||
    !activeUnit ||
    unitLimitReached ||
    armyLoading ||
    playerLoading;

  const handleCardKey = (event: KeyboardEvent<HTMLElement>, unitId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveUnitId(unitId);
    }
  };

  const getRecruitState = () => {
    if (!canModify) {
      return { disabled: true, reason: 'Login to add units' };
    }
    if (unitLimitReached) {
      return { disabled: true, reason: 'Unit cap reached' };
    }
    if (armyLoading) {
      return { disabled: true, reason: 'Loading army' };
    }
    if (playerLoading) {
      return { disabled: true, reason: 'Loading profile' };
    }
    return { disabled: false, reason: '' };
  };

  if (unitsLoading) {
    return (
      <div className="army-builder-dashboard">
        <header className="builder-header">
          <div className="builder-header__intro">
            <p className="eyebrow">Command console</p>
            <h1>Army Builder</h1>
            <p>Loading unit catalog…</p>
          </div>
        </header>
      </div>
    );
  }

  if (unitsError) {
    return (
      <div className="army-builder-dashboard">
        <header className="builder-header">
          <div className="builder-header__intro">
            <p className="eyebrow">Command console</p>
            <h1>Army Builder</h1>
            <p className="auth-error">Failed to load units: {unitsError}</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="army-builder-dashboard">
      <TplToast toast={toast} onDismiss={dismissToast} />
      <header className="builder-header">
        <div className="builder-header__intro">
          <p className="eyebrow">Command console</p>
          <h1>Army Builder</h1>
          <p>Create a focused strike force before deployment.</p>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="roster-panel panel" aria-label="Current army">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Current army</p>
              <h2>
                {draftUnits.length ? `${draftUnits.length} / ${maxUnits} units` : 'No units selected'}
                {hasUnsavedChanges && <span className="unsaved-indicator"> • Unsaved</span>}
              </h2>
            </div>
            {draftUnits.length > 0 && canModify && (
              <button className="btn btn-secondary" type="button" onClick={handleClearDraft}>
                Clear draft
              </button>
            )}
          </div>
          <p className="panel-subtitle">{draftUnits.length ? `${draftUnits.length} / ${maxUnits} units` : 'No units selected'}</p>
          <p className="panel-subtitle">Army cost: {draftTotalCredits} credits</p>
          {playerCredits !== null && <p className="panel-subtitle">Wallet: {playerCredits} credits</p>}
          {armyError && <p className="auth-error">{armyError}</p>}

          <div className="roster-list">
            {armyLoading && (
              <div className="empty-state">
                <p>Loading army…</p>
              </div>
            )}

            {!armyLoading && armyUnitsWithMeta.length === 0 && (
              <div className="empty-state">
                <p>Add units from the right to see them here.</p>
              </div>
            )}

            {!armyLoading &&
              armyUnitsWithMeta.map((unit) => (
                <div key={unit.instanceId} className="roster-item">
                  <div className="roster-item__meta">
                    <span className="unit-icon" aria-hidden="true">
                      {unit.icon || unit.name.charAt(0)}
                    </span>
                    <div>
                      <p>{unit.name}</p>
                      <small className="muted">Supply: {unit.supplyCost ?? unit.cost}</small>
                      <small>Slot {unit.slotIndex + 1}</small>
                      {pendingAdditions.some((pending) => pending.id === unit.instanceId) && (
                        <small className="new-chip">New</small>
                      )}
                    </div>
                  </div>
                  <div className="roster-item__actions">
                    <span className="supply-chip">{unit.creditCost ?? 0} credits</span>
                    {canModify && (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => handleRemoveDraftUnit(unit.instanceId)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>

          <div className="cart-summary">
            <h3>Purchase summary</h3>
            <div className="cart-grid">
              <div>
                <p className="cart-label">Pending spend</p>
                <strong>{creditsToSpend} credits</strong>
              </div>
              <div>
                <p className="cart-label">Pending refunds</p>
                <strong>{creditsToRefund} credits</strong>
              </div>
              <div>
                <p className="cart-label">Net change</p>
                <strong className={netCreditChange > 0 ? 'cart-negative' : netCreditChange < 0 ? 'cart-positive' : ''}>
                  {netCreditChange > 0 ? `-${netCreditChange}` : netCreditChange < 0 ? `+${Math.abs(netCreditChange)}` : '0'}
                </strong>
              </div>
              {playerCredits !== null && (
                <div>
                  <p className="cart-label">Projected wallet</p>
                  <strong>{projectedCredits ?? playerCredits} credits</strong>
                </div>
              )}
            </div>
            {cartError && <p className="auth-error">{cartError}</p>}
            {pendingCredits !== null && player?.current_credits !== pendingCredits && (
              <p className="pending-text">Updating wallet…</p>
            )}
            {cartSuccess && <p className="success-text">{cartSuccess}</p>}
            <div className="cart-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleApplyChanges}
                disabled={
                  !hasUnsavedChanges ||
                  !canModify ||
                  isApplying ||
                  armyLoading ||
                  playerLoading ||
                  (playerCredits !== null && netCreditChange > playerCredits)
                }
              >
                {isApplying ? 'Applying…' : 'Finalize purchase'}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={handleDiscardChanges}
                disabled={!hasUnsavedChanges || isApplying}
              >
                Discard changes
              </button>
            </div>
            {playerCredits !== null && netCreditChange > playerCredits && (
              <p className="auth-error">Not enough credits to cover this cart.</p>
            )}
          </div>
        </aside>

        <div className="main-column">
          <section className="catalog-panel panel" aria-label="Unit catalog">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Unit catalog</p>
                <h2>Unit reinforcements</h2>
              </div>
              <p className="panel-subtitle">Tap a card for intel, then add units to your army.</p>
            </div>

            <div className="catalog-grid">
              {catalogUnits.map((unit) => {
                const { disabled, reason } = getRecruitState();
                return (
                  <article
                    key={unit.id}
                    className={`unit-card ${activeUnit?.id === unit.id ? 'unit-card--active' : ''}`}
                  >
                    <div
                      className="unit-card__body"
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveUnitId(unit.id)}
                      onKeyDown={(event) => handleCardKey(event, unit.id)}
                      aria-pressed={activeUnit?.id === unit.id}
                    >
                      <div className="unit-card__media" aria-hidden="true">
                        <span>{unit.icon || unit.name.charAt(0)}</span>
                      </div>
                      <div className="unit-card__info">
                        <div>
                          <h3>{unit.name}</h3>
                          <p>Cost: {unit.creditCost} credits</p>
                          <small className="muted">Supply: {unit.supplyCost}</small>
                        </div>
                        <div className="unit-card__stats">
                          <span>
                            ⚔️ {unit.damage}
                          </span>
                          <span>
                            🛡️ {unit.defense}
                          </span>
                          <span>
                            🧊 {unit.shield ?? 0}
                          </span>
                          <span>
                            ❤️ {unit.hp}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="unit-card__actions">
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={disabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveUnitId(unit.id);
                          handleAddUnitToDraft(unit.id);
                        }}
                      >
                        Add to army
                      </button>
                      {disabled && reason && <small className="unit-card__hint">{reason}</small>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="intel-panel panel" aria-label="Unit intel">
            <div className="spotlight">
              <div className="spotlight__media">
                {activeUnit ? (
                  <UnitPreviewCanvas unit={activeUnit} />
                ) : (
                  <div className="unit-visual__placeholder">
                    <span role="img" aria-label="Target">🎯</span>
                    <p>Select a unit</p>
                  </div>
                )}
                <div className="spotlight__actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={addActiveUnit}
                    disabled={addDisabled}
                  >
                    {canModify ? 'Add to army' : 'Login to add units'}
                  </button>
                </div>
              </div>
              <div className="spotlight__stats">
                <div className="spotlight__header">
                  <p className="eyebrow">Currently viewing</p>
                  <h2>{activeUnit?.name ?? 'Select a unit'}</h2>
                  {activeUnit && (
                    <>
                      <p className="spotlight__cost">Cost: {activeUnit.creditCost} credits</p>
                      <p className="spotlight__cost">Supply: {activeUnit.supplyCost}</p>
                    </>
                  )}
                </div>
                <div className="stat-grid" role="list">
                  {statCards.map((stat) => (
                    <div key={stat.id} className="stat-card" role="listitem">
                      <span aria-hidden="true">{stat.icon}</span>
                      <div>
                        <p>{stat.label}</p>
                        <strong>
                          {stat.value}
                          {stat.suffix && <small>{stat.suffix}</small>}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="collapsible-stack">
              <CollapsibleSection
                key={`strengths-${activeUnit?.id ?? 'none'}`}
                title="Strengths"
                description="Deployment notes and battlefield role"
              >
                {(activeUnit?.behaviorOptions ?? []).length > 0 ? (
                  <ul>
                    {activeUnit?.behaviorOptions.map((behavior) => (
                      <li key={behavior}>{behavior}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No strengths documented.</p>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                key={`upgrades-${activeUnit?.id ?? 'none'}`}
                title="Upgrades"
                description="Unlockable modifiers"
              >
                {(activeUnit?.upgradeOptions ?? []).length > 0 ? (
                  <ul>
                    {activeUnit?.upgradeOptions.map((upgrade) => (
                      <li key={upgrade}>{upgrade}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No upgrades available.</p>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                key={`movement-${activeUnit?.id ?? 'none'}`}
                title="Movement & threat"
                description="Preview movement arcs and attack reach"
              >
                <MiniBoard unit={activeUnit} />
              </CollapsibleSection>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ArmyBuilder;
