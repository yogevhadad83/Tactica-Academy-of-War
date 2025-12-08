const DEFAULT_API_URL = 'http://localhost:4000';

// Detect GitHub Codespaces environment and construct the API URL for port 4000
function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) return envUrl;

  // Check if running in GitHub Codespaces (browser URL contains .app.github.dev)
  if (typeof window !== 'undefined' && window.location.hostname.includes('.app.github.dev')) {
    // Convert: xxx-5173.app.github.dev -> xxx-4000.app.github.dev
    const hostname = window.location.hostname.replace(/-5173\./, '-4000.');
    return `https://${hostname}`;
  }

  return DEFAULT_API_URL;
}

export const API_BASE_URL = getApiUrl();

export function buildWsUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const httpUrl = new URL(API_BASE_URL);
  const protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${httpUrl.host}${normalizedPath}`;
}
