import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database'

let cached: SupabaseClient<Database> | null = null

/**
 * Service-role Supabase client for server-side notification work
 * (reading participant emails across tenants). Never expose to the client.
 * Returns null if the service key isn't configured.
 */
export function useSupabaseAdmin(): SupabaseClient<Database> | null {
  if (cached) return cached
  const config = useRuntimeConfig()
  const url = process.env.SUPABASE_URL
  const key = config.supabaseServiceKey
  if (!url || !key) return null
  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
