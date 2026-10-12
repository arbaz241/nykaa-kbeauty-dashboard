/** Append to a Map of lists. Replaces `m.set(k, [...(m.get(k) ?? []), v])`, which copies the list on every add
 *  (millions of copies over the 14k review-month and 11k search-history rows). */
export function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v); else m.set(k, [v]);
}
