import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con privilegios de "service_role": bypassa RLS por completo.
 * Uso exclusivo en rutas de servidor que ya validaron el acceso por su
 * cuenta (requireAdmin() para acciones de administración, o su propia
 * validación de input para rutas públicas como /api/registro).
 * NUNCA importar desde un Client Component.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
