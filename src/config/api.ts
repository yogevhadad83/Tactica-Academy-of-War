const DEFAULT_API_URL = 'http://localhost:3000';

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? DEFAULT_API_URL;

export function buildWsUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const httpUrl = new URL(API_BASE_URL);
  const protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${httpUrl.host}${normalizedPath}`;
}
