import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
(globalThis as any).HTMLElement = dom.window.HTMLElement;
Object.defineProperty(globalThis, 'crypto', { value: dom.window.crypto, configurable: true });
(process.env as Record<string, string | undefined>).VITE_SUPABASE_URL ||= 'http://localhost/mock';
(process.env as Record<string, string | undefined>).VITE_SUPABASE_ANON_KEY ||= 'mock-key';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (!globalThis.requestAnimationFrame) {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
}

if (!globalThis.cancelAnimationFrame) {
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}
