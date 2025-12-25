import React, { createContext, useContext, useRef, useState, type ReactNode } from 'react';

interface AudioContextType {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isMuted: boolean;
  toggleMute: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const isDebugFromUrl = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
  const isDebugFromEnv = import.meta.env.VITE_FORCE_DEBUG === 'true';
  const isDebug = isDebugFromUrl || isDebugFromEnv;
  const [isMuted, setIsMuted] = useState<boolean>(isDebug);

  const toggleMute = () => {
    if (audioRef.current) {
      const nextMuted = !audioRef.current.muted;
      audioRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  return (
    <AudioContext.Provider value={{ audioRef, isMuted, toggleMute }}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return context;
};
