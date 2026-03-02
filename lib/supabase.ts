import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  // Не создаём Supabase на сервере (во время build/SSR)
  if (typeof window === "undefined") {
    throw new Error("getSupabase() must be called in the browser");
  }

  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("supabaseUrl is required. Check NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");
  }

  client = createClient(url, anon);
  return client;
}