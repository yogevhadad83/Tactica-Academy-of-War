export interface TrainingState {
  completedModuleIds: string[];
  guestCredits: number;
}

const STORAGE_NAMESPACE = 'tactica_training_progress';

// In non-browser contexts (tests/SSR), localStorage is unavailable.
// Fall back to an in-memory store to avoid import-time crashes.
const memoryStore = new Map<string, string>();

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  return {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, value);
    }
  };
}

function storageKey(userIdOrNull: string | null) {
  return `${STORAGE_NAMESPACE}:${userIdOrNull ?? 'guest'}`;
}

function readState(userIdOrNull: string | null): TrainingState {
  const raw = getStorage().getItem(storageKey(userIdOrNull));
  if (!raw) {
    return { completedModuleIds: [], guestCredits: 0 };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TrainingState>;
    return {
      completedModuleIds: Array.isArray(parsed.completedModuleIds)
        ? parsed.completedModuleIds.filter((id): id is string => typeof id === 'string')
        : [],
      guestCredits: typeof parsed.guestCredits === 'number' && Number.isFinite(parsed.guestCredits)
        ? parsed.guestCredits
        : 0
    };
  } catch {
    return { completedModuleIds: [], guestCredits: 0 };
  }
}

function writeState(userIdOrNull: string | null, state: TrainingState) {
  getStorage().setItem(storageKey(userIdOrNull), JSON.stringify(state));
}

/**
 * Returns the persisted training state for a given user id, or guest state if null.
 *
 * TODO: persist completion to the server for authenticated users.
 */
export function getTrainingState(userIdOrNull: string | null): TrainingState {
  return readState(userIdOrNull);
}

export function hasCompleted(moduleId: string, userIdOrNull: string | null = null): boolean {
  const state = readState(userIdOrNull);
  return state.completedModuleIds.includes(moduleId);
}

export function markCompleted(moduleId: string, userIdOrNull: string | null = null): TrainingState {
  const state = readState(userIdOrNull);
  if (state.completedModuleIds.includes(moduleId)) {
    return state;
  }

  const next: TrainingState = {
    ...state,
    completedModuleIds: [...state.completedModuleIds, moduleId]
  };

  writeState(userIdOrNull, next);
  return next;
}

export function getGuestCredits(): number {
  return readState(null).guestCredits;
}

/**
 * Guest-only credits. Never mix with authenticated wallet credits.
 */
export function addGuestCredits(amount: number): TrainingState {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const current = readState(null);
  const next: TrainingState = {
    ...current,
    guestCredits: Math.max(0, current.guestCredits + safeAmount)
  };

  writeState(null, next);
  return next;
}
