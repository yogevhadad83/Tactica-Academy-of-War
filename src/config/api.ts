// Production server URL - can be overridden via VITE_PRODUCTION_API_URL environment variable
const DEFAULT_PRODUCTION_URL = 'https://tactica-server.onrender.com';
const PRODUCTION_API_URL =
  (import.meta.env.VITE_PRODUCTION_API_URL as string | undefined) || DEFAULT_PRODUCTION_URL;
const LOCAL_API_URL = 'http://localhost:4000';

// Resolve the correct local URL (supports Codespaces forwarded port)
function getLocalApiUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname.includes('.app.github.dev')) {
    // Convert: xxx-5173.app.github.dev -> xxx-4000.app.github.dev
    const hostname = window.location.hostname.replace(/-5173\./, '-4000.');
    return `https://${hostname}`;
  }
  return LOCAL_API_URL;
}

function getApiUrl(): string {
  // Priority 1: Explicit override for any custom configuration
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) return envUrl;

  // Priority 2: Explicit opt-in to local dev server
  const useLocal = import.meta.env.VITE_USE_LOCAL_SERVER as string | undefined;
  if (useLocal === 'true') return getLocalApiUrl();

  // Priority 3: Default to production server (no local server required)
  return PRODUCTION_API_URL;
}

export const API_BASE_URL = getApiUrl();

export function buildWsUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const httpUrl = new URL(API_BASE_URL);
  const protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${httpUrl.host}${normalizedPath}`;
}
