import { createContext, useContext, type ReactNode } from 'react';
import { usePlayer as usePlayerHook } from '../hooks/usePlayer';

const PlayerContext = createContext<ReturnType<typeof usePlayerHook> | undefined>(undefined);

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const playerState = usePlayerHook();
  return <PlayerContext.Provider value={playerState}>{children}</PlayerContext.Provider>;
};

export const usePlayerContext = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error('usePlayerContext must be used within a PlayerProvider');
  }
  return ctx;
};
