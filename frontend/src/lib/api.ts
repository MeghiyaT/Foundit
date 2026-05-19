import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

let tokenProvider: (() => Promise<string | null>) | null = null;

export function setTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

// ─── Simple in-memory response cache (stale-while-revalidate) ────────────────
// Caches GET responses for TTL_MS. Subsequent calls return the stale value
// instantly while the fresh fetch runs in the background.

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes for most endpoints
const CACHE_VERSION = 'v3'; // bump version to clear old 5-min entries immediately

// Short TTL for endpoints whose data changes frequently (deletions, status changes).
// This limits cross-browser stale data to at most the TTL duration.
const SHORT_TTL_PREFIXES: [string, number][] = [
  ['/items', 60 * 1000],       // public browse feed — 60 s
  ['/admin/items', 60 * 1000], // admin items list — 60 s
  ['/admin/claims', 60 * 1000],// admin claims list — 60 s
  ['/my-items', 60 * 1000],    // user's own items — 60 s
  ['/matches', 60 * 1000],     // user's AI matches — 60 s
];

function getTTL(url: string): number {
  for (const [prefix, ttl] of SHORT_TTL_PREFIXES) {
    if (url.startsWith(prefix)) return ttl;
  }
  return DEFAULT_TTL_MS;
}

interface CacheEntry {
  data: unknown;
  ts: number;
}

const memCache = new Map<string, CacheEntry>();

function readCache(key: string): CacheEntry | null {
  // In-memory first
  const mem = memCache.get(key);
  if (mem) return mem;
  // Fallback to localStorage (survives navigation but not hard-reload memory)
  try {
    const raw = localStorage.getItem(`fc_${CACHE_VERSION}_${key}`);
    if (raw) {
      const entry: CacheEntry = JSON.parse(raw);
      memCache.set(key, entry);
      return entry;
    }
  } catch { /* ignore */ }
  return null;
}

function writeCache(key: string, data: unknown) {
  const entry: CacheEntry = { data, ts: Date.now() };
  memCache.set(key, entry);
  try {
    localStorage.setItem(`fc_${CACHE_VERSION}_${key}`, JSON.stringify(entry));
  } catch { /* ignore quota errors */ }
}

/**
 * Invalidate all cached entries matching a prefix.
 * Call this after mutations so stale data is cleared.
 * e.g. invalidateCache('/admin') clears all admin endpoints.
 */
export function invalidateCache(prefix = '') {
  for (const key of [...memCache.keys()]) {
    if (key.startsWith(prefix)) memCache.delete(key);
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(`fc_${CACHE_VERSION}_`) && k.includes(prefix)) {
        localStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }
}

/**
 * Cached GET — returns stale data immediately (if within TTL) while
 * fetching fresh data in the background.
 */
export async function cachedGet<T = unknown>(url: string, fresh = false): Promise<T> {
  const entry = readCache(url);
  const isStale = !entry || (Date.now() - entry.ts > getTTL(url));

  if (entry && !fresh) {
    if (!isStale) {
      // Fresh enough — return immediately
      return entry.data as T;
    }
    // Stale — return immediately AND revalidate in background
    api.get(url).then(({ data }) => writeCache(url, data)).catch(() => {});
    return entry.data as T;
  }

  // No cache or forced fresh — await the real request
  const { data } = await api.get(url);
  writeCache(url, data);
  return data as T;
}

// ─── Axios interceptors ────────────────────────────────────────────────────────

api.interceptors.request.use(async (config) => {
  if (tokenProvider) {
    const token = await tokenProvider();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const currentPath = window.location.pathname + window.location.search;
      if (!currentPath.startsWith('/sign-in') && !currentPath.startsWith('/sign-up')) {
        window.location.href = `/sign-in?redirect=${encodeURIComponent(currentPath)}`;
      }
    }
    return Promise.reject(error);
  }
);

export default api;