"use client";

import useSWR from "swr";
import { fetchAll } from "./supabase";

/** The day each followed product's reviews were last read (migration 032, applied 21 Oct 2026 with the owner's OK).
 *  A month counts as complete only when the product was read after that month ended; before 032 this was guessed
 *  from whether any later review existed, so a product read on 25 Sep could show a false September drop. Loaded
 *  beside the page (never holding it up); until it arrives the old rule applies. */
let read: Map<string, string> | null = null;

export function useReviewRead() {
  const { data } = useSWR("review_read", async () => {
    const rows = await fetchAll<{ product_id: string; read_on: string }>("web_review_read");
    read = new Map(rows.map((r) => [r.product_id, String(r.read_on).slice(0, 10)]));
    return read;
  }, { revalidateOnFocus: false });
  return data ?? null;
}

/** The read date of a product (YYYY-MM-DD), or null when unknown or not loaded yet. */
export const readOn = (pid: string | null | undefined): string | null => (pid ? read?.get(pid) ?? null : null);

/** Last day of the month that starts on `month` (YYYY-MM-01). */
export function monthEnd(month: string) {
  const d = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}
