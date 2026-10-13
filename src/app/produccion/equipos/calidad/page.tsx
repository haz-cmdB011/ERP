import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { leer } from "@/lib/supabase/leer";
import { nombreCategoria } from "@/lib/calidad/categorias";
import { PROCESO_LABELS, hoyMexico, type EquipoProduccion } from "@/lib/produccion/asignaciones";
import { cargarCalidadPorEquipo } from "@/lib/produccion/calidad-equipos-db";
import { PERIODOS, inicioPeriodo, leerPeriodo, porcentaje, type MetricasEquipo } from "@/lib/produccion/calidad-equipos";
import EstadoVacio from "@/components/estado-vacio";

export const metadata: Metadata = { title: "Calidad por equipo" };

// Una tasa alta se resalta: a partir de aquí conviene revisar con el equipo.
const TASA_ALTA = 0.1;

function Tasa({ valor, piezas, de }: { valor: number | null; piezas: number; de: number }) {
  if (valor === null) return <span className="text-slate-500">—</span>;
  return (
    <span className={valor >= TASA_ALTA ? "font-semibold text-rose-700" : "text-slate-800"}>
      {porcentaje(valor)}
      <span className="block text-xs font-normal text-slate-500">
        {piezas} de {de}
      </span>
    </span>
  );
}

// Qué tan seguido se rechaza lo que entrega cada equipo: primero en la
// revisión del trabajador de Producción y luego en Calidad, y los defectos
// más comunes. Sirve para decidir a quién asignar.
export default async function CalidadPorEquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: periodoParam } = await searchParams;
  const periodo = leerPeriodo(periodoParam);
  const desde = inicioPeriodo(periodo, hoyMexico());

  const supabase = await createClient();
  const [equipos, metricas] = await Promise.all([
    leer(
      supabase
        .from("equipos_produccion")
        .select("id, nombre, encargado, es_planta, procesos, activo")
        .returns<EquipoProduccion[]>(),
      "los equipos"
    ),
    cargarCalidadPorEquipo(supabase, desde),
  ]);
  const equipoPorId = new Map((equipos ?? []).map((e) => [e.id, e]));
  // Más evaluado primero: es donde las tasas dicen más.
  const filas = [...metricas].sort((a, b) => b.evaluadas - a.evaluadas || b.entregadas - a.entregadas);
  const total = filas.reduce<MetricasEquipo>(
    (t, m) => ({
      ...t,
      entregadas: t.entregadas + m.entregadas,
      verificadas: t.verificadas + m.verificadas,
      rechazadasProduccion: t.rechazadasProduccion + m.rechazadasProduccion,
      evaluadas: t.evaluadas + m.evaluadas,
      aprobadas: t.aprobadas + m.aprobadas,
      rechazadasCalidad: t.rechazadasCalidad + m.rechazadasCalidad,
    }),
    {
      equipoId: "total",
      entregadas: 0,
      verificadas: 0,
      rechazadasProduccion: 0,
      evaluadas: 0,
      aprobadas: 0,
      rechazadasCalidad: 0,
      rechazoInterno: null,
      rechazoCalidad: null,
      defectos: [],
    }
  );
  const revisadasTotal = total.verificadas + total.rechazadasProduccion;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Calidad por equipo</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cuánto de lo que entrega cada equipo se rechaza en la revisión de Producción y en Calidad, y qué
            defectos se repiten. Cuenta las entregas por su fecha de entrega.
          </p>
        </div>
        <Link
          href="/produccion/equipos"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
        >
          Equipos
        </Link>
      </div>

      <nav aria-label="Periodo" className="flex flex-wrap gap-2 text-sm">
        {PERIODOS.map((p) => (
          <Link
            key={p.valor}
            href={`/produccion/equipos/calidad?periodo=${p.valor}`}
            aria-current={p.valor === periodo ? "true" : undefined}
            className={`rounded-full border px-3 py-1.5 transition-colors ${
              p.valor === periodo
                ? "border-brand-500 bg-brand-50 font-medium text-brand-800"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p.etiqueta}
          </Link>
        ))}
      </nav>

      {filas.length === 0 ? (
        <EstadoVacio
          titulo="Sin entregas en este periodo"
          descripcion="Cuando los equipos entreguen y se revise lo entregado, aquí aparecerán sus números."
          accion={{ href: "/produccion/asignaciones", etiqueta: "Ir a Asignaciones" }}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Equipo</th>
                <th className="px-3 py-3 text-right">Entregadas</th>
                <th className="px-3 py-3 text-right" title="Piezas que el trabajador de Producción regresó al equipo">
                  Rechazo de Producción
                </th>
                <th className="px-3 py-3 text-right" title="Piezas que Calidad no aprobó, de las que evaluó">
                  Rechazo de Calidad
                </th>
                <th className="px-3 py-3">Defectos más comunes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((m) => {
                const eq = equipoPorId.get(m.equipoId);
                return (
                  <tr key={m.equipoId} className="align-top">
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-900">{eq?.nombre ?? "Equipo"}</span>
                      <span className="block text-xs text-slate-500">
                        {(eq?.procesos ?? []).map((p) => PROCESO_LABELS[p]).join(" y ")}
                        {eq?.es_planta ? " · planta" : eq?.encargado ? ` · ${eq.encargado}` : ""}
                        {eq && !eq.activo ? " · inactivo" : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">{m.entregadas}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Tasa
                        valor={m.rechazoInterno}
                        piezas={m.rechazadasProduccion}
                        de={m.verificadas + m.rechazadasProduccion}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Tasa valor={m.rechazoCalidad} piezas={m.rechazadasCalidad} de={m.evaluadas} />
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">
                      {m.defectos.length === 0
                        ? "—"
                        : m.defectos
                            .slice(0, 3)
                            .map((d) => `${nombreCategoria(d.categoria) ?? "Sin tipo"} (${d.piezas})`)
                            .join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                <td className="px-3 py-2 text-slate-900">Todos los equipos</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">{Math.round(total.entregadas * 100) / 100}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Tasa
                    valor={revisadasTotal > 0 ? total.rechazadasProduccion / revisadasTotal : null}
                    piezas={Math.round(total.rechazadasProduccion * 100) / 100}
                    de={Math.round(revisadasTotal * 100) / 100}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Tasa
                    valor={total.evaluadas > 0 ? total.rechazadasCalidad / total.evaluadas : null}
                    piezas={Math.round(total.rechazadasCalidad * 100) / 100}
                    de={Math.round(total.evaluadas * 100) / 100}
                  />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Se resalta en rojo una tasa de {porcentaje(TASA_ALTA)} o más. Las entregas anuladas por error de captura no
        cuentan; las que siguen sin revisar cuentan como entregadas pero no en las tasas.
      </p>
    </main>
  );
}
