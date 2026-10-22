import type { Metadata } from "next";
import Link from "next/link";
import PestanasSeccion from "@/app/produccion/pestanas-seccion";
import VistaEquipos from "./vista-equipos";
import VistaLista from "./vista-lista";

export const metadata: Metadata = { title: "Taller" };

type Vista = "equipos" | "lista";

const VISTAS: { id: Vista; etiqueta: string; href: string }[] = [
  { id: "equipos", etiqueta: "Por equipo", href: "/produccion/taller" },
  { id: "lista", etiqueta: "Lista", href: "/produccion/taller?vista=lista" },
];

// El taller en una sola pantalla con dos vistas de lo mismo: "Por equipo" (qué tiene cada equipo y qué
// va atrasado) y "Lista" (cada asignación, con filtros, entregas y Excel). La vista elegida vive en la
// dirección (?vista=lista) para poder compartirla y que sobreviva a recargar. Las direcciones viejas
// /produccion/tablero y /produccion/asignaciones redirigen aquí.
export default async function TallerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const valor = Array.isArray(params.vista) ? params.vista[0] : params.vista;
  const vista: Vista = valor === "lista" ? "lista" : "equipos";

  return (
    <main className={`mx-auto flex flex-col gap-5 p-4 sm:p-6 ${vista === "lista" ? "max-w-7xl" : "max-w-6xl"}`}>
      <PestanasSeccion seccion="taller" />
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Taller</h1>
          <p className="mt-1 text-sm text-slate-500">
            {vista === "equipos" ? "Qué hay en cada equipo ahora y qué va atrasado." : "Cada asignación, con sus filtros y entregas."}
          </p>
        </div>
        <nav aria-label="Vista del taller" className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
          {VISTAS.map((v) => (
            <Link
              key={v.id}
              href={v.href}
              aria-current={v.id === vista ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-md px-3.5 font-medium transition-colors pointer-coarse:min-h-11 ${
                v.id === vista ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              {v.etiqueta}
            </Link>
          ))}
        </nav>
      </div>

      {vista === "equipos" ? <VistaEquipos /> : <VistaLista params={params} />}
    </main>
  );
}
