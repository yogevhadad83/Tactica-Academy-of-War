// Production server URL - can be overridden via VITE_PRODUCTION_API_URL environment variable
const DEFAULT_PRODUCTION_URL = 'https://tactica-server.onrender.com';
const PRODUCTION_API_URL =
  (import.meta.env.VITE_PRODUCTION_API_URL as string | undefined) || DEFAULT_PRODUCTION_URL;
const LOCAL_API_URL = 'http://localhost:4000';

// Resolve the correct local URL (supports Codespaces forwarded ports)
function getLocalApiUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Codespaces forwarded-port hostnames look like:
    //   <codespace>-5173.app.github.dev
    //   <codespace>-5173.preview.app.github.dev
    // Use the same domain style (preview vs non-preview) that the frontend is using
    const match = hostname.match(/^(.*)-(\d+)\.(preview\.)?app\.github\.dev$/);
    if (match) {
      const base = match[1];
      const port = 4000;
      const previewPrefix = match[3] || ''; // Keep same prefix as current page
      return `https://${base}-${port}.${previewPrefix}app.github.dev`;
    }
  }
  return LOCAL_API_URL;
}

function getApiUrl(): string {
  // Priority 1: Explicit override for any custom configuration
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) return envUrl;

  // Priority 2: Explicit opt-in/out toggle
  // - `true`  => local server
  // - `false` => production server
  const useLocal = import.meta.env.VITE_USE_LOCAL_SERVER as string | undefined;
  if (useLocal === 'true') return getLocalApiUrl();
  if (useLocal === 'false') return PRODUCTION_API_URL;

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
