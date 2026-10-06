import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { exigeSegundoPaso, faltaSegundoPaso } from "@/lib/seguridad/mfa";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresca la sesión si el access token expiró.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Verificación en dos pasos: quien la activó y todavía no puso su código (la
  // sesión está en aal1) no puede usar la app ni sus rutas /api: se le manda a
  // terminar de iniciar sesión. Ante cualquier error al leer el nivel NO se
  // bloquea (ver faltaSegundoPaso), para no dejar a nadie fuera por una falla.
  const { pathname } = request.nextUrl;
  if (user && exigeSegundoPaso(pathname)) {
    try {
      const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (faltaSegundoPaso(nivel)) {
        const bloqueo = pathname.startsWith("/api/")
          ? NextResponse.json(
              { error: "Falta la verificación en dos pasos. Inicia sesión de nuevo." },
              { status: 401 }
            )
          : NextResponse.redirect(new URL("/login?mfa=1", request.url));
        // Conserva las cookies de sesión que se acaban de refrescar.
        response.cookies.getAll().forEach((cookie) => bloqueo.cookies.set(cookie));
        return bloqueo;
      }
    } catch {
      // Sin datos del nivel: se deja pasar (las rutas y la base siguen exigiendo sesión).
    }
  }

  return response;
}
