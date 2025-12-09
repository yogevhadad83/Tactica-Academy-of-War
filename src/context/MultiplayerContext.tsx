import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useUser } from './UserContext';
import { useGameServer } from '../hooks/useGameServer';

const MultiplayerContext = createContext<ReturnType<typeof useGameServer> | undefined>(undefined);

export const MultiplayerProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { currentUser } = useUser();
  const username = currentUser?.username ?? user?.email ?? null;
  const gameServer = useGameServer(username);
  const value = useMemo(() => gameServer, [gameServer]);

  return <MultiplayerContext.Provider value={value}>{children}</MultiplayerContext.Provider>;
};

export const useMultiplayer = () => {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) {
    throw new Error('useMultiplayer must be used within a MultiplayerProvider');
  }
  return ctx;
};
