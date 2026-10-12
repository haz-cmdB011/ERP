import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/get-perfil";

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

// Saludo de una línea al inicio de cada área: el nombre de usuario de quien entró y la fecha.
// Si se le pasan `acciones`, salen como enlaces discretos a la derecha.
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
  const ahora = new Date();

  return (
    <section
      aria-label="Bienvenida"
      className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1"
    >
      <p className="min-w-0 text-lg text-slate-500">
        Hola, <span className="font-semibold text-slate-900">{nombre ?? "bienvenido"}</span>
        <span className="text-sm"> · {fechaLarga(ahora)}</span>
      </p>
      {acciones.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {acciones.map((a) => (
            <Link key={a.href} href={a.href} className="font-medium text-brand-700 hover:underline">
              {a.etiqueta}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
