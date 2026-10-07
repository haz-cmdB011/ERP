import { createClient } from "@supabase/supabase-js";

// Comprueba la contraseña de quien YA tiene sesión, para acciones irreversibles
// (reconfirmar identidad). Usa un cliente aparte y sin persistencia: no toca las
// cookies ni la sesión actual. Supabase Auth limita los intentos fallidos por su
// cuenta. Devuelve false ante cualquier fallo, incluida una cuenta sin contraseña
// (acceso solo por enlace mágico): en ese caso no hay forma de reconfirmar.
export async function verificarContrasena(email: string | undefined, contrasena: string): Promise<boolean> {
  if (!email || !contrasena) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return false;

  const cliente = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await cliente.auth.signInWithPassword({ email, password: contrasena });
  return !error;
}
