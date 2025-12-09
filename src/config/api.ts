// Production server URL - update this with your deployed backend URL
const PRODUCTION_API_URL = 'https://tactica-server.onrender.com';
const LOCAL_API_URL = 'http://localhost:4000';

// Detect GitHub Codespaces environment and construct the API URL for port 4000
function getApiUrl(): string {
  // Priority 1: Explicit VITE_API_URL override (for any custom configuration)
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) return envUrl;

  // Priority 2: Check if explicitly using local server for development
  const useLocal = import.meta.env.VITE_USE_LOCAL_SERVER as string | undefined;
  if (useLocal === 'true') return LOCAL_API_URL;

  // Priority 3: GitHub Codespaces environment detection
  if (typeof window !== 'undefined' && window.location.hostname.includes('.app.github.dev')) {
    // Convert: xxx-5173.app.github.dev -> xxx-4000.app.github.dev
    const hostname = window.location.hostname.replace(/-5173\./, '-4000.');
    return `https://${hostname}`;
  }

  // Priority 4: Default to production server (no need to spin up local server)
  return PRODUCTION_API_URL;
}

export const API_BASE_URL = getApiUrl();

export function buildWsUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const httpUrl = new URL(API_BASE_URL);
  const protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${httpUrl.host}${normalizedPath}`;
}
