import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/get-perfil";
import { EstrellaMarca } from "./marca";
import Avatar from "./avatar";
import { urlAvatar } from "@/lib/cuenta/avatar";

// La empresa trabaja en hora del centro de México; el servidor corre en UTC.
const ZONA = "America/Mexico_City";

function fechaLarga(ahora: Date): string {
  const texto = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: ZONA,
  }).format(ahora);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export interface AccionBienvenida {
  href: string;
  etiqueta: string;
}

// Banda de bienvenida al inicio de cada área: el nombre de usuario de quien
// entró y la fecha, más accesos directos.
// La primera acción es la principal (verde); las demás, secundarias.
export default async function Bienvenida({ acciones = [] }: { acciones?: AccionBienvenida[] }) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  // Nombre de usuario: el mismo que se muestra y edita en Administración >
  // Usuarios (en el maquilador, su contratista); si está vacío, la parte del
  // correo antes de la @.
  let nombre: string | null = null;
  if (perfil) {
    const { data } = await supabase
      .from("perfiles")
      .select("nombre_completo, email")
      .eq("id", perfil.userId)
      .single();
    // El nombre que la persona puso en su perfil manda; el maquilador, si no lo
    // puso, se muestra con su contratista.
    const propio = perfil.rol === "maquilador" ? perfil.contratista : null;
    nombre = data?.nombre_completo?.trim() || propio?.trim() || data?.email?.split("@")[0] || null;
  }
  const avatarUrl = perfil ? await urlAvatar(perfil.userId, perfil.avatarPath) : null;
  const ahora = new Date();

  return (
    <section
      aria-label="Bienvenida"
      className="relative overflow-hidden rounded-2xl border border-nav-line bg-nav p-5 text-on-nav sm:p-6"
    >
      <EstrellaMarca className="anim-girar pointer-events-none absolute -right-10 -top-10 h-56 w-56 text-brand-500 opacity-[0.08]" />
      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar
            url={avatarUrl}
            inicial={(nombre?.[0] ?? "?").toUpperCase()}
            tamano="h-14 w-14 sm:h-16 sm:w-16"
            textoClase="text-2xl"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-on-nav-suave">
              {fechaLarga(ahora)}
            </p>
            <h2 className="mt-1.5 text-2xl font-light tracking-tight sm:text-3xl">
              <span className="font-semibold text-brand-500">{nombre ?? "Bienvenido"}</span>
            </h2>
          </div>
        </div>
        {acciones.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {acciones.map((a, i) => (
              <Link
                key={a.href}
                href={a.href}
                className={
                  i === 0
                    ? "inline-flex min-h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-on-brand shadow-sm transition hover:bg-brand-400"
                    : "inline-flex min-h-10 items-center rounded-lg border border-nav-line px-4 text-sm font-medium text-on-nav transition hover:bg-nav-hover"
                }
              >
                {a.etiqueta}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
