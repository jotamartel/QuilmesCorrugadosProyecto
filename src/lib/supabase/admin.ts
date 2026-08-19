import { createClient } from '@supabase/supabase-js';

// Cliente admin con service role key para operaciones del servidor
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
