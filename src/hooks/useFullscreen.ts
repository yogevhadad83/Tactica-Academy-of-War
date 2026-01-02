import { useCallback, useEffect, useState } from 'react';

interface FullscreenControls {
  isFullscreen: boolean;
  isSupported: boolean;
  error: string | null;
  enter: (element?: HTMLElement | null) => Promise<void>;
  exit: () => Promise<void>;
  toggle: (element?: HTMLElement | null) => Promise<void>;
}

const getSupport = () => typeof document !== 'undefined' && 'fullscreenEnabled' in document && Boolean(document.fullscreenEnabled);

export function useFullscreen(): FullscreenControls {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(Boolean(typeof document !== 'undefined' && document.fullscreenElement));
  const [error, setError] = useState<string | null>(null);
  const isSupported = getSupport();

  useEffect(() => {
    if (!isSupported) return undefined;
    const handleChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
    };
  }, [isSupported]);

  const enter = useCallback(async (element?: HTMLElement | null) => {
    if (!isSupported) {
      setError('Fullscreen is not supported in this browser.');
      return;
    }
    const target = element ?? document.documentElement;
    if (!target.requestFullscreen) {
      setError('Fullscreen API unavailable for this element.');
      return;
    }
    try {
      await target.requestFullscreen();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enter fullscreen.');
    }
  }, [isSupported]);

  const exit = useCallback(async () => {
    if (!isSupported) {
      setError('Fullscreen is not supported in this browser.');
      return;
    }
    if (!document.fullscreenElement) {
      setIsFullscreen(false);
      return;
    }
    try {
      await document.exitFullscreen();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to exit fullscreen.');
    }
  }, [isSupported]);

  const toggle = useCallback(async (element?: HTMLElement | null) => {
    if (document.fullscreenElement) {
      await exit();
    } else {
      await enter(element);
    }
  }, [enter, exit]);

  return { isFullscreen, isSupported, error, enter, exit, toggle };
}
