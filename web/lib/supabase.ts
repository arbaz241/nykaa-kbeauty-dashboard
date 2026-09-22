"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser Supabase client. The anon key is public by design; row-level security limits reads to signed-in users. */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/** Fetch every row of a view, paging past Supabase's 1,000-row response cap. */
export async function fetchAll<T>(view: string, columns = "*", pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase().from(view).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`${view}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return out;
  }
}
