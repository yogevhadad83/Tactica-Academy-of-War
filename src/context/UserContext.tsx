import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { units } from '../data/units';
import type {
  ArmyUnitInstance,
  AuthResult,
  BoardPlacements,
  StrategyBook,
  StrategyRule,
  UserProfile
} from '../types';

const USERS_KEY = 'tactica_users';
const CURRENT_USER_KEY = 'tactica_current_user';

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

const createDefaultUsers = (): UserProfile[] => {
  const userOneStrategies = buildStrategyBook();
  userOneStrategies.archer = [
    {
      id: createId(),
      unitId: 'archer',
      condition: 'Enemy in range',
      action: 'Attack priority'
    }
  ];

  const userTwoStrategies = buildStrategyBook();
  userTwoStrategies.horseman = [
    {
      id: createId(),
      unitId: 'horseman',
      condition: 'Path blocked',
      action: 'Move sideways'
    }
  ];

  return [
    {
      id: 'commander-nova',
      username: 'CommanderNova',
      password: 'nova123',
      gold: 1500,
      level: 6,
      army: [cloneUnit('knight'), cloneUnit('archer'), cloneUnit('horseman'), cloneUnit('dragon')],
      strategies: userOneStrategies,
      boardPlacements: {}
    },
    {
      id: 'general-orion',
      username: 'GeneralOrion',
      password: 'orion123',
      gold: 980,
      level: 4,
      army: [cloneUnit('knight'), cloneUnit('knight'), cloneUnit('beast')],
      strategies: userTwoStrategies,
      boardPlacements: {}
    }
  ];
};

const normalizeUser = (user: UserProfile): UserProfile => {
  // Migrate old unit IDs to current ones
  const unitIdMigrations: Record<string, string> = {
    soldier: 'knight', // old 'soldier' was renamed to 'knight'
  };
  
  const migratedArmy = user.army.map((unit) => {
    const newId = unitIdMigrations[unit.id];
    if (newId) {
      // Find the current template for this unit
      const template = units.find((u) => u.id === newId);
      if (template) {
        return {
          ...template,
          instanceId: unit.instanceId,
        };
      }
    }
    return unit;
  });

  return {
    ...user,
    army: migratedArmy,
    strategies: user.strategies ?? buildStrategyBook(),
    boardPlacements: user.boardPlacements ?? {}
  };
};

const readStoredUsers = (): UserProfile[] => {
  if (typeof window === 'undefined') {
    return createDefaultUsers();
  }
  const raw = window.localStorage.getItem(USERS_KEY);
  if (!raw) {
    return createDefaultUsers();
  }
  try {
    const parsed = JSON.parse(raw) as UserProfile[];
    return parsed.map(normalizeUser);
  } catch (error) {
    console.warn('Failed to parse stored users, resetting to defaults.', error);
    return createDefaultUsers();
  }
};

const readStoredCurrentUserId = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(CURRENT_USER_KEY);
};

export interface UserContextValue {
  users: UserProfile[];
  currentUser: UserProfile | null;
  login: (username: string, password: string) => AuthResult;
  register: (username: string, password: string) => AuthResult;
  logout: () => void;
  switchUser: (userId: string) => void;
  updateArmy: (army: ArmyUnitInstance[]) => void;
  updateStrategies: (strategies: StrategyBook) => void;
  addStrategyRule: (unitId: string, rule: StrategyRule) => void;
  removeStrategyRule: (unitId: string, ruleId: string) => void;
  updateBoardPlacements: (placements: BoardPlacements) => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [users, setUsers] = useState<UserProfile[]>(() => readStoredUsers());
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => readStoredCurrentUserId());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentUserId) {
      window.localStorage.setItem(CURRENT_USER_KEY, currentUserId);
    } else {
      window.localStorage.removeItem(CURRENT_USER_KEY);
    }
  }, [currentUserId]);

  const currentUser = useMemo(() => {
    if (!currentUserId) return null;
    return users.find((user) => user.id === currentUserId) ?? null;
  }, [currentUserId, users]);

  const login = useCallback(
    (username: string, password: string): AuthResult => {
      const matched = users.find((user) => user.username.toLowerCase() === username.toLowerCase());
      if (!matched) {
        return { success: false, message: 'User not found' };
      }
      if (matched.password !== password) {
        return { success: false, message: 'Incorrect password' };
      }
      setCurrentUserId(matched.id);
      return { success: true };
    },
    [users]
  );

  const register = useCallback(
    (username: string, password: string): AuthResult => {
      const exists = users.some((user) => user.username.toLowerCase() === username.toLowerCase());
      if (exists) {
        return { success: false, message: 'Username already taken' };
      }
      const newUser: UserProfile = {
        id: createId(),
        username,
        password,
        gold: 500,
        level: 1,
        army: [],
        strategies: buildStrategyBook(),
        boardPlacements: {}
      };
      setUsers((prev) => [...prev, newUser]);
      setCurrentUserId(newUser.id);
      return { success: true };
    },
    [users]
  );

  const logout = useCallback(() => {
    setCurrentUserId(null);
  }, []);

  const switchUser = useCallback((userId: string) => {
    setCurrentUserId(userId);
  }, []);

  const updateUser = useCallback(
    (updater: (user: UserProfile) => UserProfile) => {
      if (!currentUserId) return;
      setUsers((prev) => prev.map((user) => (user.id === currentUserId ? updater(user) : user)));
    },
    [currentUserId]
  );

  const updateArmy = useCallback(
    (army: ArmyUnitInstance[]) => {
      updateUser((user) => ({ ...user, army }));
    },
    [updateUser]
  );

  const updateStrategies = useCallback(
    (strategies: StrategyBook) => {
      updateUser((user) => ({ ...user, strategies }));
    },
    [updateUser]
  );

  const addStrategyRule = useCallback(
    (unitId: string, rule: StrategyRule) => {
      updateUser((user) => {
        const current = user.strategies[unitId] ?? [];
        return {
          ...user,
          strategies: {
            ...user.strategies,
            [unitId]: [...current, rule]
          }
        };
      });
    },
    [updateUser]
  );

  const removeStrategyRule = useCallback(
    (unitId: string, ruleId: string) => {
      updateUser((user) => ({
        ...user,
        strategies: {
          ...user.strategies,
          [unitId]: (user.strategies[unitId] ?? []).filter((rule) => rule.id !== ruleId)
        }
      }));
    },
    [updateUser]
  );

  const updateBoardPlacements = useCallback(
    (placements: BoardPlacements) => {
      updateUser((user) => ({ ...user, boardPlacements: placements }));
    },
    [updateUser]
  );

  const value: UserContextValue = {
    users,
    currentUser,
    login,
    register,
    logout,
    switchUser,
    updateArmy,
    updateStrategies,
    addStrategyRule,
    removeStrategyRule,
    updateBoardPlacements
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return ctx;
};
