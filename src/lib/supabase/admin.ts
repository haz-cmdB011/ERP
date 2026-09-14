import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con privilegios de "service_role": bypassa RLS por completo.
 * Uso exclusivo en rutas de servidor que ya validaron con requireAdmin().
 * NUNCA importar desde un Client Component.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
