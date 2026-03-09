/**
 * 簡單的內存 TTL 緩存（analytics 查詢用）
 * 當 Redis 不可用時作為 fallback；生產可換成 Redis 實現。
 */

interface CacheEntry { data: unknown; expires: number; }
const cache = new Map<string, CacheEntry>();

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expires > now) return entry.data as T;

  const data = await fn();
  cache.set(key, { data, expires: now + ttlSeconds * 1000 });

  // Evict old entries periodically (every 100 reads)
  if (Math.random() < 0.01) {
    for (const [k, v] of cache.entries()) {
      if (v.expires <= now) cache.delete(k);
    }
  }
  return data;
}

export function invalidateCache(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
