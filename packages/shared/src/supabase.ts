import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('SUPABASE_URL env var is required')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is required')
  return createClient(url, key)
}
