import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ChipEstado from "@/components/chip-estado";
import ResumenInicio from "@/components/resumen-inicio";
import {
  PROCESO_LABELS,
  hoyMexico,
  type EquipoProduccion,
} from "@/lib/produccion/asignaciones";
import { resumirTaller, type FilaTaller, type ResumenEquipo } from "@/lib/produccion/atrasos";
import { cargarTaller } from "@/lib/produccion/cargar-taller";
import ChipPlazo from "../chip-plazo";

export const metadata: Metadata = { title: "Tablero del taller" };

// Filas que se muestran por equipo y en la lista de atrasadas; el resto está
// a un clic en Asignaciones.
const FILAS_POR_EQUIPO = 5;
const MAX_ATRASADAS = 50;

// El tablero del taller: qué tiene cada equipo hoy y qué va atrasado. Una
// asignación está atrasada si sigue en taller y su PM ya pasó la fecha de
// entrega (ver lib/produccion/atrasos.ts).
export default async function TableroPage() {
  const supabase = await createClient();
  const hoy = hoyMexico();

  const [{ asignaciones, plazos }, { data: equiposActivos }] = await Promise.all([
    cargarTaller(supabase, hoy),
    supabase
      .from("equipos_produccion")
      .select("id, nombre, encargado, es_planta, procesos, activo")
      .eq("activo", true)
      .order("es_planta", { ascending: false })
      .order("nombre")
      .returns<EquipoProduccion[]>(),
  ]);

  const resumen = resumirTaller(asignaciones, plazos, hoy);
  const equipoPorId = new Map((equiposActivos ?? []).map((e) => [e.id, e]));
  const ocupados = new Set(resumen.equipos.map((e) => e.equipoId));
  const libres = (equiposActivos ?? []).filter((e) => !ocupados.has(e.id));
  const equiposConAtraso = resumen.equipos.filter((e) => e.atrasadas > 0).length;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tablero del taller</h1>
        <p className="mt-1 text-sm text-slate-500">
          Qué tiene cada equipo hoy. Atrasada: sigue en taller y su PM ya pasó la fecha de entrega.
        </p>
      </div>

      <ResumenInicio
        tarjetas={[
          {
            valor: resumen.total,
            etiqueta: "En taller",
            detalle: `asignaciones en ${resumen.equipos.length} equipo${resumen.equipos.length === 1 ? "" : "s"}`,
            href: "/produccion/asignaciones",
          },
          {
            valor: resumen.atrasadas.length,
            etiqueta: "Atrasadas",
            detalle: equiposConAtraso
              ? `en ${equiposConAtraso} equipo${equiposConAtraso === 1 ? "" : "s"}`
              : "PM con fecha vencida",
            href: "#atrasadas",
            tono: "atencion",
          },
          {
            valor: resumen.porVencer,
            etiqueta: "Vencen esta semana",
            detalle: "entrega del PM en 7 días o menos",
          },
          {
            valor: libres.length,
            etiqueta: "Equipos libres",
            detalle: "sin trabajo en taller",
          },
        ]}
      />

      {resumen.atrasadas.length > 0 && (
        <section id="atrasadas" className="flex scroll-mt-4 flex-col gap-3">
          <h2 className="text-base font-semibold text-rose-800">
            Atrasadas ({resumen.atrasadas.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-rose-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-rose-50 text-xs font-semibold uppercase tracking-wide text-rose-800">
                  <th className="px-3 py-2.5">PM</th>
                  <th className="px-3 py-2.5">Modelo</th>
                  <th className="px-3 py-2.5">Equipo</th>
                  <th className="px-3 py-2.5 text-right">Falta</th>
                  <th className="px-3 py-2.5">Atraso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resumen.atrasadas.slice(0, MAX_ATRASADAS).map((f) => (
                  <tr key={f.id} className="align-top">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      <PmEnlace fila={f} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-900">{f.modelo ?? "—"}</span>
                      <span className="block text-xs text-slate-500">Ítem {f.item_code}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-900">{f.equipo}</span>
                      <span className="block text-xs text-slate-500">{PROCESO_LABELS[f.proceso]}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <span className="font-medium text-slate-900">{f.pendiente}</span>{" "}
                      <span className="text-xs text-slate-500">{f.unidad ?? ""}</span>
                    </td>
                    <td className="px-3 py-2">
                      <ChipPlazo plazo={f.plazo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resumen.atrasadas.length > MAX_ATRASADAS && (
            <p className="text-xs text-slate-500">
              Se muestran las {MAX_ATRASADAS} más atrasadas. El resto está en{" "}
              <Link href="/produccion/asignaciones" className="font-medium text-brand-700 hover:underline">
                Asignaciones
              </Link>
              .
            </p>
          )}
        </section>
      )}

      {resumen.equipos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          <p>No hay nada en taller ahora.</p>
          <Link href="/produccion" className="font-medium text-brand-700 hover:underline">
            Elegir un pedido para asignar →
          </Link>
        </div>
      ) : (
        <section aria-label="Equipos" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resumen.equipos.map((e) => (
            <TarjetaEquipo key={e.equipoId} resumen={e} equipo={equipoPorId.get(e.equipoId)} />
          ))}
        </section>
      )}

      {libres.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Equipos libres</h2>
          <ul className="flex flex-wrap gap-2">
            {libres.map((e) => (
              <li
                key={e.id}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700"
                title={e.procesos.map((p) => PROCESO_LABELS[p]).join(" y ")}
              >
                {e.nombre}
                {e.es_planta ? " (planta)" : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function PmEnlace({ fila }: { fila: FilaTaller }) {
  return fila.pedido_id ? (
    <Link
      href={`/produccion/pedidos/${fila.pedido_id}/asignaciones`}
      className="hover:text-brand-700 hover:underline"
    >
      {fila.numero_pedido}
    </Link>
  ) : (
    <>{fila.numero_pedido}</>
  );
}

function TarjetaEquipo({
  resumen: r,
  equipo,
}: {
  resumen: ResumenEquipo;
  equipo: EquipoProduccion | undefined;
}) {
  const href = `/produccion/asignaciones?equipo=${r.equipoId}`;
  const visibles = r.filas.slice(0, FILAS_POR_EQUIPO);
  return (
    <article
      className={`flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm ${
        r.atrasadas > 0 ? "border-rose-200" : "border-slate-200"
      }`}
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-semibold text-slate-900">
            <Link href={href} className="hover:text-brand-700 hover:underline">
              {r.equipo}
            </Link>
          </h3>
          <span className="shrink-0 text-2xl font-semibold tabular-nums text-slate-900">
            {r.filas.length}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {equipo?.es_planta ? "Planta" : (equipo?.encargado ?? "Maquilador")}
          {equipo ? ` · ${equipo.procesos.map((p) => PROCESO_LABELS[p]).join(" y ")}` : ""}
          {" · "}
          {r.pedidos} PM · la más antigua lleva {r.masAntigua} d
        </p>
        {(r.atrasadas > 0 || r.porVencer > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {r.atrasadas > 0 && (
              <ChipEstado tono="peligro">
                {r.atrasadas} atrasada{r.atrasadas === 1 ? "" : "s"}
              </ChipEstado>
            )}
            {r.porVencer > 0 && (
              <ChipEstado tono="alerta">
                {r.porVencer} vence{r.porVencer === 1 ? "" : "n"} pronto
              </ChipEstado>
            )}
          </div>
        )}
      </header>

      <ul className="flex flex-col divide-y divide-slate-100 border-t border-slate-100">
        {visibles.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-900">
                {f.modelo ?? `Ítem ${f.item_code}`}
              </span>
              <span className="block truncate text-xs text-slate-500">
                <PmEnlace fila={f} /> · {PROCESO_LABELS[f.proceso]} · {f.diasEnTaller} d
              </span>
            </span>
            <span className="whitespace-nowrap text-xs text-slate-600">
              faltan <span className="font-medium text-slate-900">{f.pendiente}</span> {f.unidad ?? ""}
            </span>
            <ChipPlazo plazo={f.plazo} />
          </li>
        ))}
      </ul>

      {r.filas.length > visibles.length && (
        <Link href={href} className="text-sm font-medium text-brand-700 hover:underline">
          Ver las {r.filas.length} asignaciones →
        </Link>
      )}
    </article>
  );
}
