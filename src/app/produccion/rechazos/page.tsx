import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { leer } from "@/lib/supabase/leer";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { nombreCategoria } from "@/lib/calidad/categorias";
import {
  ESTADO_ASIGNACION_LABELS,
  PROCESO_LABELS,
  formatoFecha,
  hoyMexico,
  type AsignacionResumen,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import { formatoFechaDMA } from "@/lib/resumen/entrega";
import { DIAS_SIN_REASIGNAR, diasEsperando } from "@/lib/produccion/detenidos";
import EstadoVacio from "@/components/estado-vacio";
import ReasignarRetrabajo from "./reasignar-retrabajo";

export const metadata: Metadata = { title: "Rechazado por Calidad" };

// Fila de la vista rechazos_calidad.
interface Rechazo {
  informe_id: string;
  folio: string;
  elaborado_en: string;
  motivo: string | null;
  categoria: string | null;
  cantidad: number | string;
  fecha_entrega: string;
  planeacion_item_id: string | null;
  pedido_id: string | null;
  numero_pedido: string;
  item_code: number | null;
  modelo: string | null;
  descripcion: string | null;
  unidad: string | null;
  proceso: Proceso;
  equipo_id: string;
  equipo: string;
  reasignado: number | string;
  por_reasignar: number | string;
}

interface InformeComponente {
  planeacion_item_id: string;
  folio: string;
  aprobado: boolean;
  descripcion: string | null;
  categoria: string | null;
  elaborado_en: string;
}

interface ItemComponente {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  estado_revision: string | null;
  eliminacion_solicitada_en: string | null;
  pedido_versiones: {
    pedido_id: string;
    pedidos: {
      numero_pedido: string;
      eliminado_en: string | null;
      eliminado_definitivo_en: string | null;
      cancelado_en: string | null;
    } | null;
  } | null;
}

// Lo que Calidad rechazó. Los lotes de muebles se reasignan como retrabajo al
// equipo que se elija (sugiere el que lo entregó); el retrabajo vuelve a
// entregarse, se verifica y regresa a Calidad. Los componentes no aprobados se
// listan para darles seguimiento: se corrigen y Calidad los vuelve a evaluar.
export default async function RechazosPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const puedeEditar = puedeEditarProduccion(perfil);
  const hoy = hoyMexico();
  const [a, m, d] = hoy.split("-").map(Number);
  const hace30 = new Date(Date.UTC(a, m - 1, d - 30)).toISOString();

  const [filasPorReasignar, filasReasignados, filasEquipos, filasComponentes] = await Promise.all([
    leer(
      supabase
        .from("rechazos_calidad")
        .select("*")
        .eq("vigente", true)
        .gt("por_reasignar", 0)
        .order("elaborado_en")
        .returns<Rechazo[]>(),
      "los rechazos de Calidad"
    ),
    leer(
      supabase
        .from("rechazos_calidad")
        .select("*")
        .eq("vigente", true)
        .lte("por_reasignar", 0)
        .gte("elaborado_en", hace30)
        .order("elaborado_en", { ascending: false })
        .limit(50)
        .returns<Rechazo[]>(),
      "los rechazos ya reasignados"
    ),
    leer(
      supabase
        .from("equipos_produccion")
        .select("id, nombre, encargado, es_planta, procesos, activo")
        .order("es_planta", { ascending: false })
        .order("nombre")
        .returns<EquipoProduccion[]>(),
      "los equipos"
    ),
    // Componentes: su último informe manda. Se traen los no aprobados recientes
    // y luego el historial de esos ítems para quedarse con los que siguen así.
    leer(
      supabase
        .from("informes_calidad")
        .select("planeacion_item_id")
        .is("entrega_id", null)
        .eq("aprobado", false)
        .order("elaborado_en", { ascending: false })
        .limit(300)
        .returns<{ planeacion_item_id: string }[]>(),
      "los componentes no aprobados"
    ),
  ]);

  const porReasignar = filasPorReasignar ?? [];
  const reasignados = filasReasignados ?? [];
  const equipos = filasEquipos ?? [];

  // Retrabajos de lo ya reasignado: a quién y cómo van.
  const idsReasignados = reasignados.map((r) => r.informe_id);
  const retrabajos = idsReasignados.length
    ? await leer(
        supabase
          .from("asignaciones_produccion_resumen")
          .select("*")
          .in("informe_rechazo_id", idsReasignados)
          .neq("estado", "cancelada")
          .returns<AsignacionResumen[]>(),
        "los retrabajos"
      )
    : [];
  const retrabajosPorInforme = new Map<string, AsignacionResumen[]>();
  for (const r of retrabajos ?? []) {
    if (!r.informe_rechazo_id) continue;
    retrabajosPorInforme.set(r.informe_rechazo_id, [...(retrabajosPorInforme.get(r.informe_rechazo_id) ?? []), r]);
  }

  const idsComponentes = [...new Set((filasComponentes ?? []).map((i) => i.planeacion_item_id))];
  const [historialComponentes, itemsComponentes] = idsComponentes.length
    ? await Promise.all([
        leer(
          supabase
            .from("informes_calidad")
            .select("planeacion_item_id, folio, aprobado, descripcion, categoria, elaborado_en")
            .in("planeacion_item_id", idsComponentes)
            .order("elaborado_en", { ascending: false })
            .returns<InformeComponente[]>(),
          "el historial de los componentes"
        ),
        leer(
          supabase
            .from("planeacion_items")
            .select(
              "id, item_code, modelo, descripcion, estado_revision, eliminacion_solicitada_en, pedido_versiones!inner ( pedido_id, pedidos!inner ( numero_pedido, eliminado_en, eliminado_definitivo_en, cancelado_en ) )"
            )
            .in("id", idsComponentes)
            .eq("tipo_registro", "FU")
            .returns<ItemComponente[]>(),
          "los componentes"
        ),
      ])
    : [[] as InformeComponente[], [] as ItemComponente[]];
  const ultimoPorItem = new Map<string, InformeComponente>();
  for (const i of historialComponentes ?? []) {
    if (!ultimoPorItem.has(i.planeacion_item_id)) ultimoPorItem.set(i.planeacion_item_id, i);
  }
  const componentes = (itemsComponentes ?? [])
    .filter((it) => {
      const p = it.pedido_versiones?.pedidos;
      return (
        it.estado_revision !== "cancelado" &&
        !it.eliminacion_solicitada_en &&
        p &&
        !p.eliminado_en &&
        !p.eliminado_definitivo_en &&
        !p.cancelado_en &&
        ultimoPorItem.get(it.id)?.aprobado === false
      );
    })
    .map((it) => ({ item: it, informe: ultimoPorItem.get(it.id)! }))
    .sort((x, y) => x.informe.elaborado_en.localeCompare(y.informe.elaborado_en));

  const nada = porReasignar.length === 0 && reasignados.length === 0 && componentes.length === 0;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Rechazado por Calidad</h1>
        <p className="mt-1 text-sm text-slate-500">
          Piezas que Calidad no aprobó. Reasígnalas como retrabajo: el equipo vuelve a entregarlas, las verificas y
          regresan a Calidad. El retrabajo no cuenta contra la cantidad del mueble.
        </p>
      </div>

      {nada && (
        <EstadoVacio
          titulo="Calidad no tiene rechazos pendientes"
          descripcion="Cuando Calidad rechace piezas de un lote aparecerán aquí para reasignarlas."
          accion={{ href: "/produccion/asignaciones", etiqueta: "Ir a Asignaciones" }}
        />
      )}

      {porReasignar.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Por reasignar <span className="font-normal text-slate-500">({porReasignar.length})</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {porReasignar.map((r) => {
              const pendiente = Number(r.por_reasignar);
              const dias = diasEsperando(r.elaborado_en, hoy);
              const desc = `${r.numero_pedido} · ${r.modelo ?? `ítem ${r.item_code}`}`;
              return (
                <li key={r.informe_id} className="rounded-xl border border-rose-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {r.pedido_id ? (
                          <Link
                            href={`/produccion/pedidos/${r.pedido_id}/asignaciones`}
                            className="hover:text-brand-700 hover:underline"
                          >
                            {desc}
                          </Link>
                        ) : (
                          desc
                        )}
                        <span className="ml-2 font-mono text-xs font-medium text-rose-700">{r.folio}</span>
                      </p>
                      <p className="text-sm text-slate-600">
                        <strong className="text-rose-700">
                          {pendiente} {r.unidad ?? "pz"}
                        </strong>{" "}
                        por reasignar
                        {Number(r.reasignado) > 0 ? ` (de ${Number(r.cantidad)} rechazadas)` : ""} · lo entregó{" "}
                        {r.equipo} ({PROCESO_LABELS[r.proceso]}) el {formatoFecha(r.fecha_entrega)}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {nombreCategoria(r.categoria) && (
                          <span className="mr-1 rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-700">
                            {nombreCategoria(r.categoria)}
                          </span>
                        )}
                        {r.motivo}
                      </p>
                      <p className={`mt-1 text-xs ${dias >= DIAS_SIN_REASIGNAR ? "font-medium text-amber-700" : "text-slate-500"}`}>
                        Rechazado el {formatoFechaDMA(r.elaborado_en)}
                        {dias > 0 ? ` · hace ${dias} día${dias === 1 ? "" : "s"}` : ""}
                      </p>
                    </div>
                    {puedeEditar && (
                      <ReasignarRetrabajo
                        informeId={r.informe_id}
                        folio={r.folio}
                        descripcion={desc}
                        proceso={r.proceso}
                        equipoOriginalId={r.equipo_id}
                        porReasignar={pendiente}
                        unidad={r.unidad}
                        equipos={equipos}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {componentes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Componentes no aprobados <span className="font-normal text-slate-500">({componentes.length})</span>
          </h2>
          <p className="text-sm text-slate-500">
            Se evalúan aparte de su mueble. Corrígelos y avisa a Calidad para que los vuelva a evaluar.
          </p>
          <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
            {componentes.map(({ item, informe }) => (
              <li key={item.id} className="p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {item.pedido_versiones?.pedidos?.numero_pedido} · ítem {item.item_code}
                  {item.modelo ? ` · ${item.modelo}` : ""}
                  <span className="ml-2 font-mono text-xs font-medium text-rose-700">{informe.folio}</span>
                </p>
                <p className="text-slate-700">
                  {nombreCategoria(informe.categoria) && (
                    <span className="mr-1 rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-700">
                      {nombreCategoria(informe.categoria)}
                    </span>
                  )}
                  {informe.descripcion}
                </p>
                <p className="text-xs text-slate-500">Rechazado el {formatoFechaDMA(informe.elaborado_en)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reasignados.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-slate-900">Reasignados (últimos 30 días)</h2>
          <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
            {reasignados.map((r) => (
              <li key={r.informe_id} className="p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {r.numero_pedido} · {r.modelo ?? `ítem ${r.item_code}`}
                  <span className="ml-2 font-mono text-xs text-slate-600">{r.folio}</span>
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {Number(r.cantidad)} {r.unidad ?? "pz"} rechazadas el {formatoFechaDMA(r.elaborado_en)}
                  </span>
                </p>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-slate-600">
                  {(retrabajosPorInforme.get(r.informe_id) ?? []).map((t) => (
                    <li key={t.id}>
                      {t.equipo}: {Number(t.cantidad)} {t.unidad ?? "pz"} · {ESTADO_ASIGNACION_LABELS[t.estado]}
                      {Number(t.por_verificar) > 0 ? ` · ${Number(t.por_verificar)} por verificar` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
