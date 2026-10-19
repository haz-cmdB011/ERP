import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getPerfilActual,
  puedeAdministrarProduccion,
  puedeEditarProduccion,
} from "@/lib/auth/get-perfil";
import {
  etiquetaProceso,
  PROCESOS,
  formatoFecha,
  type AsignacionResumen,
  type EncargadoEquipo,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import { entregasPorAsignacion, type EntregaConFoto } from "@/lib/produccion/consultar-asignaciones";
import AsignarLote, { type MuebleParaLote } from "@/app/produccion/asignaciones/asignar-lote";
import DetalleAsignacion, {
  EstadoAsignacionBadge,
} from "@/app/produccion/asignaciones/detalle-asignacion";

import { admiteElectrificacion } from "@/lib/produccion/electrificacion";
import { admiteSuperficieSolida } from "@/lib/produccion/superficie-solida";
import { avancePaso, type MuebleFlujo } from "@/lib/produccion/flujo-mueble";
import { rutaSugerida } from "@/lib/produccion/ruta";
import { cargarRutas } from "@/lib/produccion/rutas-db";
import { revisionFinalActiva } from "@/lib/calidad/ajustes-flujo";
import { cargarRevisionFinal } from "@/lib/calidad/revision-final";
import FlujoMuebles from "./flujo-muebles";
import { leer } from "@/lib/supabase/leer";
interface MuebleRow {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  estado_liberacion: string;
  eliminacion_solicitada_en: string | null;
  estado_revision: string | null;
}

// Asignación de los muebles de un PM a equipos (maquiladores o planta). Solo
// se asignan muebles (ítems padre) liberados de la versión activa, paso por paso
// de su ruta (ver src/lib/produccion/ruta.ts).
export default async function AsignacionesPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const puedeEditar = puedeEditarProduccion(perfil);
  const puedeAnular = puedeAdministrarProduccion(perfil);

  const pedido = await leer(
    supabase
    .from("pedidos")
    .select("id, numero_pedido, eliminado_en, cancelado_en, proyectos ( nombre, cliente )")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      numero_pedido: string;
      eliminado_en: string | null;
      cancelado_en: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    }>(),
    "pedidos"
  );
  if (!pedido || pedido.eliminado_en) notFound();

  const version = await leer(
    supabase
    .from("pedido_versiones")
    .select("id, numero_version")
    .eq("pedido_id", id)
    .eq("es_version_activa", true)
    .maybeSingle<{ id: string; numero_version: number }>(),
    "pedido_versiones"
  );

  const [muebles, asignaciones, equipos, encargados, componentes] = await Promise.all([
    version
      ? leer(
          supabase
            .from("planeacion_items")
            .select(
              "id, item_code, modelo, descripcion, cantidad_total, unidad, estado_liberacion, eliminacion_solicitada_en, estado_revision"
            )
            .eq("pedido_version_id", version.id)
            .eq("tipo_registro", "MO")
            .order("fila_excel_origen")
            .returns<MuebleRow[]>(),
          "planeacion_items"
        )
      : Promise.resolve([] as MuebleRow[]),
    leer(
      supabase
        .from("asignaciones_produccion_resumen")
        .select("*")
        .eq("pedido_id", id)
        .order("fecha_asignacion")
        .order("creado_en")
        .returns<AsignacionResumen[]>(),
      "asignaciones_produccion_resumen"
    ),
    leer(
      supabase
        .from("equipos_produccion")
        .select("id, nombre, encargado, es_planta, procesos, activo")
        .eq("activo", true)
        .order("es_planta", { ascending: false })
        .order("nombre")
        .returns<EquipoProduccion[]>(),
      "equipos_produccion"
    ),
    leer(
      supabase
        .from("encargados_equipo_produccion")
        .select("equipo_id, nombre")
        .order("nombre")
        .returns<EncargadoEquipo[]>(),
      "encargados_equipo_produccion"
    ),
    // Componentes: Electrificación también se detecta por lo que dicen los hijos.
    version
      ? leer(
          supabase
            .from("planeacion_items")
            .select("parent_item_id, descripcion")
            .eq("pedido_version_id", version.id)
            .eq("tipo_registro", "FU")
            .returns<{ parent_item_id: string | null; descripcion: string | null }[]>(),
          "los componentes"
        )
      : Promise.resolve([] as { parent_item_id: string | null; descripcion: string | null }[]),
  ]);

  const descripcionesHijos = new Map<string, string[]>();
  for (const c of componentes ?? []) {
    if (!c.parent_item_id || !c.descripcion) continue;
    const lista = descripcionesHijos.get(c.parent_item_id) ?? [];
    lista.push(c.descripcion);
    descripcionesHijos.set(c.parent_item_id, lista);
  }

  const vigentes = (muebles ?? []).filter(
    (m) => !m.eliminacion_solicitada_en && m.estado_revision !== "cancelado"
  );
  const liberados = vigentes.filter((m) => m.estado_liberacion === "enviado_a_produccion");
  const sinLiberar = vigentes.length - liberados.length;
  const idsLiberados = new Set(liberados.map((m) => m.id));

  const todas = asignaciones ?? [];
  const [entregas, rutas, finalActiva] = await Promise.all([
    entregasPorAsignacion(
      supabase,
      todas.map((a) => a.id)
    ),
    cargarRutas(supabase, liberados.map((m) => m.id)),
    revisionFinalActiva(supabase),
  ]);
  // Revisión final de Calidad (ajuste revision_final, hoy apagado).
  const revisionFinal = finalActiva
    ? (await cargarRevisionFinal(supabase, liberados.map((m) => m.id))).resumen
    : null;
  const porItem = new Map<string, AsignacionResumen[]>();
  for (const a of todas) {
    if (!a.planeacion_item_id || !idsLiberados.has(a.planeacion_item_id)) continue;
    const lista = porItem.get(a.planeacion_item_id) ?? [];
    lista.push(a);
    porItem.set(a.planeacion_item_id, lista);
  }
  // Las de versiones anteriores del PM (o de muebles que ya no están
  // liberados) no se pierden: se muestran aparte.
  const otras = todas.filter((a) => !a.planeacion_item_id || !idsLiberados.has(a.planeacion_item_id));

  const pedidoCancelado = !!pedido.cancelado_en;

  // Electrificación y Superficie Sólida solo si el mueble o sus componentes las llevan.
  const aplicaA = (m: MuebleRow): Record<Proceso, boolean> => {
    const hijos = descripcionesHijos.get(m.id);
    return {
      armado: true,
      barniz: true,
      electrificacion: admiteElectrificacion(m.descripcion, hijos),
      superficie_solida: admiteSuperficieSolida(m.descripcion, hijos),
    };
  };

  // Cada mueble con su ruta: la guardada o, si aún no tiene, la sugerida.
  const flujo: MuebleFlujo[] = liberados.map((m) => {
    const guardada = rutas.get(m.id);
    const aplica = aplicaA(m);
    return {
      id: m.id,
      item_code: m.item_code,
      modelo: m.modelo,
      unidad: m.unidad,
      cantidad: Number(m.cantidad_total),
      aplica,
      ruta: guardada && guardada.pasos.length > 0 ? guardada.pasos : rutaSugerida(aplica),
      versionRuta: guardada?.version ?? 0,
      asignaciones: porItem.get(m.id) ?? [],
      revisionFinal: revisionFinal ? { aprobadas: revisionFinal.get(m.id)?.aprobadas ?? 0 } : null,
    };
  });

  // Para asignar varios muebles de una vez: lo que falta de cada uno.
  const paraLote: MuebleParaLote[] = flujo.map((m) => ({
    id: m.id,
    item_code: m.item_code,
    modelo: m.modelo,
    unidad: m.unidad,
    ...disponibleDe(m),
  }));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Asignar a equipos — {pedido.numero_pedido}
          </h1>
          <p className="text-sm text-slate-600">
            {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
            {version ? ` · versión ${version.numero_version}` : ""}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Cada mueble sigue su ruta (la sugerida es Armado → Superficie Sólida → Barniz → Electrificación) y cada paso se asigna por separado, aunque se repita. Electrificación y Superficie Sólida solo entran en los muebles que las llevan (lo dice la descripción del mueble o de sus componentes). Asignar antes de que el paso anterior entregue se puede, pero queda marcado como adelantado.
          </p>
        </div>
        {puedeEditar && !pedidoCancelado && liberados.length > 1 && (
          <AsignarLote muebles={paraLote} equipos={equipos ?? []} encargados={encargados ?? []} />
        )}
      </div>

      {pedidoCancelado && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Este PM está cancelado: ya no se pueden hacer asignaciones nuevas.
        </p>
      )}
      {sinLiberar > 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {sinLiberar} mueble{sinLiberar === 1 ? "" : "s"} de este PM todavía no se ha
          {sinLiberar === 1 ? "" : "n"} liberado a producción; aparecerán aquí al liberarlos.
        </p>
      )}
      {puedeEditar && (equipos ?? []).length <= 1 && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          Da de alta tus equipos de armado y barniz en{" "}
          <Link href="/produccion/equipos" className="font-medium underline">
            Equipos
          </Link>{" "}
          para poder asignarles trabajo.
        </p>
      )}

      {liberados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          <p>Aún no hay muebles liberados para asignar.</p>
          <Link href={`/produccion/pedidos/${pedido.id}`} className="font-medium text-brand-700 hover:underline">
            Ir a liberar ítems →
          </Link>
        </div>
      ) : (
        <FlujoMuebles
          muebles={flujo}
          asignar={
            puedeEditar && !pedidoCancelado
              ? {
                  equipos: equipos ?? [],
                  encargados: encargados ?? [],
                  numeroPedido: pedido.numero_pedido,
                }
              : null
          }
          detalles={Object.fromEntries(
            todas.map((a) => [
              a.id,
              <DetalleAsignacion
                key={a.id}
                asignacion={a}
                entregas={entregas.get(a.id) ?? []}
                puedeEditar={puedeEditar}
                puedeAnular={puedeAnular}
              />,
            ])
          )}
        />
      )}

      {otras.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Asignaciones de versiones anteriores o de muebles ya no liberados
          </h2>
          <ul className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
            {otras.map((a) => (
              <FilaAsignacion
                key={a.id}
                a={a}
                entregas={entregas.get(a.id) ?? []}
                puedeEditar={puedeEditar}
                puedeAnular={puedeAnular}
                mostrarItem
              />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

// Por proceso, lo que falta por asignar en el primer paso de ese proceso que
// aún tiene lugar (el mismo que elige crear_asignacion_produccion cuando no se
// le dice el paso) y cuánto de eso ya entregó el paso anterior. Lo que la ruta
// no lleva queda en 0.
function disponibleDe(m: MuebleFlujo): Pick<MuebleParaLote, "disponible" | "listo"> {
  const disponible = Object.fromEntries(PROCESOS.map((p) => [p, 0])) as Record<Proceso, number>;
  const listo = { ...disponible };
  for (const p of PROCESOS) {
    const i = m.ruta.findIndex((x, j) => x.proceso === p && avancePaso(m, j).disponible > 0);
    if (i < 0) continue;
    const a = avancePaso(m, i);
    disponible[p] = a.disponible;
    listo[p] = a.listo;
  }
  return { disponible, listo };
}

function FilaAsignacion({
  a,
  entregas,
  puedeEditar,
  puedeAnular,
  mostrarItem = false,
}: {
  a: AsignacionResumen;
  entregas: EntregaConFoto[];
  puedeEditar: boolean;
  puedeAnular: boolean;
  mostrarItem?: boolean;
}) {
  return (
    <li>
      <details className="rounded-lg border border-slate-100">
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
          {mostrarItem && (
            <span className="font-medium text-slate-900">
              Ítem {a.item_code}
              {a.modelo ? ` · ${a.modelo}` : ""}
            </span>
          )}
          <span className="font-medium text-slate-900">{a.equipo}</span>
          <span className="text-slate-600">{etiquetaProceso(a)}</span>
          {a.encargado && <span className="text-slate-600">Encargado: {a.encargado}</span>}
          {a.folio_rechazo && (
            <span className="text-xs font-medium text-rose-700">Retrabajo · {a.folio_rechazo}</span>
          )}
          <span className="text-slate-600">
            {Number(a.entregado)}/{Number(a.cantidad)} {a.unidad ?? ""}
          </span>
          <span className="text-slate-500">asignada {formatoFecha(a.fecha_asignacion)}</span>
          {a.ultima_entrega && (
            <span className="text-slate-500">última entrega {formatoFecha(a.ultima_entrega)}</span>
          )}
          <EstadoAsignacionBadge estado={a.estado} />
        </summary>
        <div className="border-t border-slate-100 bg-slate-50 p-3">
          <DetalleAsignacion
            asignacion={a}
            entregas={entregas}
            puedeEditar={puedeEditar}
            puedeAnular={puedeAnular}
          />
        </div>
      </details>
    </li>
  );
}
