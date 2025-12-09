import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { units } from '../data/units';
import type { ArmyUnitInstance, BoardPlacements, StrategyBook, StrategyRule } from '../types';

export interface PlayerProfile {
  id: string;
  username: string;
  army: ArmyUnitInstance[];
  strategies: StrategyBook;
  boardPlacements: BoardPlacements;
}

interface UserContextValue {
  currentUser: PlayerProfile | null;
  updateArmy: (army: ArmyUnitInstance[]) => void;
  updateStrategies: (strategies: StrategyBook) => void;
  addStrategyRule: (unitId: string, rule: StrategyRule) => void;
  removeStrategyRule: (unitId: string, ruleId: string) => void;
  updateBoardPlacements: (placements: BoardPlacements) => void;
}

const PLAYER_PROFILES_KEY = 'tactica_player_profiles';

const createId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const buildStrategyBook = (): StrategyBook => {
  return units.reduce((acc, unit) => {
    acc[unit.id] = acc[unit.id] ?? [];
    return acc;
  }, {} as StrategyBook);
};

const cloneUnit = (unitId: string): ArmyUnitInstance => {
  const template = units.find((u) => u.id === unitId);
  if (!template) {
    throw new Error(`Unknown unit: ${unitId}`);
  }
  return {
    ...template,
    instanceId: createId()
  };
};

const createDefaultProfile = (id: string, username: string): PlayerProfile => {
  const strategyBook = buildStrategyBook();
  strategyBook.archer = [
    {
      id: createId(),
      unitId: 'archer',
      condition: 'Enemy in range',
      action: 'Attack priority'
    }
  ];

  return {
    id,
    username,
    army: [cloneUnit('knight'), cloneUnit('archer'), cloneUnit('beast')],
    strategies: strategyBook,
    boardPlacements: {}
  };
};

const readProfiles = (): Record<string, PlayerProfile> => {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(PLAYER_PROFILES_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, PlayerProfile>;
  } catch (error) {
    console.warn('Failed to parse stored profiles, resetting.', error);
    return {};
  }
};

const persistProfiles = (profiles: Record<string, PlayerProfile>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PLAYER_PROFILES_KEY, JSON.stringify(profiles));
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const { user: authUser } = useAuth();
  const [profiles, setProfiles] = useState<Record<string, PlayerProfile>>(() => readProfiles());
  const [currentUser, setCurrentUser] = useState<PlayerProfile | null>(null);

  useEffect(() => {
    if (!authUser) {
      setCurrentUser(null);
      return;
    }

    setProfiles((prev) => {
      const existing = prev[authUser.id];
      const username = authUser.email?.split('@')[0] ?? 'Commander';
      const profile = existing ?? createDefaultProfile(authUser.id, username);
      const next = existing ? prev : { ...prev, [authUser.id]: profile };
      setCurrentUser(profile);
      persistProfiles(next);
      return next;
    });
  }, [authUser]);

  useEffect(() => {
    persistProfiles(profiles);
  }, [profiles]);

  const currentUserId = authUser?.id ?? null;

  const updateProfile = useCallback(
    (updater: (profile: PlayerProfile) => PlayerProfile) => {
      if (!currentUserId) return;
      setProfiles((prev) => {
        const existing = prev[currentUserId];
        if (!existing) return prev;
        const updated = updater(existing);
        const next = { ...prev, [currentUserId]: updated };
        setCurrentUser(updated);
        return next;
      });
    },
    [currentUserId]
  );

  const updateArmy = useCallback(
    (army: ArmyUnitInstance[]) => {
      updateProfile((profile) => ({ ...profile, army }));
    },
    [updateProfile]
  );

  const updateStrategies = useCallback(
    (strategies: StrategyBook) => {
      updateProfile((profile) => ({ ...profile, strategies }));
    },
    [updateProfile]
  );

  const addStrategyRule = useCallback(
    (unitId: string, rule: StrategyRule) => {
      updateProfile((profile) => {
        const current = profile.strategies[unitId] ?? [];
        return {
          ...profile,
          strategies: {
            ...profile.strategies,
            [unitId]: [...current, rule]
          }
        };
      });
    },
    [updateProfile]
  );

  const removeStrategyRule = useCallback(
    (unitId: string, ruleId: string) => {
      updateProfile((profile) => ({
        ...profile,
        strategies: {
          ...profile.strategies,
          [unitId]: (profile.strategies[unitId] ?? []).filter((rule) => rule.id !== ruleId)
        }
      }));
    },
    [updateProfile]
  );

  const updateBoardPlacements = useCallback(
    (placements: BoardPlacements) => {
      updateProfile((profile) => ({ ...profile, boardPlacements: placements }));
    },
    [updateProfile]
  );

  const value: UserContextValue = useMemo(
    () => ({
      currentUser,
      updateArmy,
      updateStrategies,
      addStrategyRule,
      removeStrategyRule,
      updateBoardPlacements,
    }),
    [currentUser, updateArmy, updateStrategies, addStrategyRule, removeStrategyRule, updateBoardPlacements]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return ctx;
};
