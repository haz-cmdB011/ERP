import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getPerfilActual,
  puedeAdministrarProduccion,
  puedeEditarProduccion,
} from "@/lib/auth/get-perfil";
import {
  PROCESO_LABELS,
  PROCESOS,
  formatoFecha,
  type AsignacionResumen,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import { entregasPorAsignacion, type EntregaConFoto } from "@/lib/produccion/consultar-asignaciones";
import AsignarForm from "@/app/produccion/asignaciones/asignar-form";
import DetalleAsignacion, {
  EstadoAsignacionBadge,
} from "@/app/produccion/asignaciones/detalle-asignacion";

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
// se asignan muebles (ítems padre) liberados de la versión activa.
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

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, numero_pedido, eliminado_en, cancelado_en, proyectos ( nombre, cliente )")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      numero_pedido: string;
      eliminado_en: string | null;
      cancelado_en: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    }>();
  if (!pedido || pedido.eliminado_en) notFound();

  const { data: version } = await supabase
    .from("pedido_versiones")
    .select("id, numero_version")
    .eq("pedido_id", id)
    .eq("es_version_activa", true)
    .maybeSingle<{ id: string; numero_version: number }>();

  const [{ data: muebles }, { data: asignaciones }, { data: equipos }] = await Promise.all([
    version
      ? supabase
          .from("planeacion_items")
          .select(
            "id, item_code, modelo, descripcion, cantidad_total, unidad, estado_liberacion, eliminacion_solicitada_en, estado_revision"
          )
          .eq("pedido_version_id", version.id)
          .eq("tipo_registro", "MO")
          .order("fila_excel_origen")
          .returns<MuebleRow[]>()
      : Promise.resolve({ data: [] as MuebleRow[] }),
    supabase
      .from("asignaciones_produccion_resumen")
      .select("*")
      .eq("pedido_id", id)
      .order("fecha_asignacion")
      .order("creado_en")
      .returns<AsignacionResumen[]>(),
    supabase
      .from("equipos_produccion")
      .select("id, nombre, encargado, es_planta, procesos, activo")
      .eq("activo", true)
      .order("es_planta", { ascending: false })
      .order("nombre")
      .returns<EquipoProduccion[]>(),
  ]);

  const vigentes = (muebles ?? []).filter(
    (m) => !m.eliminacion_solicitada_en && m.estado_revision !== "cancelado"
  );
  const liberados = vigentes.filter((m) => m.estado_liberacion === "enviado_a_produccion");
  const sinLiberar = vigentes.length - liberados.length;
  const idsLiberados = new Set(liberados.map((m) => m.id));

  const todas = asignaciones ?? [];
  const entregas = await entregasPorAsignacion(
    supabase,
    todas.map((a) => a.id)
  );
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

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Asignar a equipos — {pedido.numero_pedido}
        </h1>
        <p className="text-sm text-slate-600">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
          {version ? ` · versión ${version.numero_version}` : ""}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Un mueble se puede repartir entre varios equipos o con la planta. Cada proceso (armado y barniz)
          se asigna por separado.
        </p>
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
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          No hay muebles liberados a producción en la versión activa.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {liberados.map((m) => {
            const lista = porItem.get(m.id) ?? [];
            const activas = lista.filter((a) => !a.cancelada_en);
            const resumen = Object.fromEntries(
              PROCESOS.map((p) => {
                const deP = activas.filter((a) => a.proceso === p);
                const asignado = deP.reduce((s, a) => s + Number(a.cantidad), 0);
                const entregado = deP.reduce((s, a) => s + Number(a.entregado), 0);
                return [p, { asignado, entregado }];
              })
            ) as Record<Proceso, { asignado: number; entregado: number }>;
            const disponible = Object.fromEntries(
              PROCESOS.map((p) => [p, Math.round((Number(m.cantidad_total) - resumen[p].asignado) * 100) / 100])
            ) as Record<Proceso, number>;
            const descripcion = `${pedido.numero_pedido} · ítem ${m.item_code}${m.modelo ? ` · ${m.modelo}` : ""}`;

            return (
              <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {m.item_code}
                      {m.modelo ? ` · ${m.modelo}` : ""}
                    </p>
                    <p className="line-clamp-2 text-sm text-slate-600">{m.descripcion?.split("\n")[0]}</p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {Number(m.cantidad_total)} {m.unidad}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {PROCESOS.map((p) => (
                      <div key={p} className="min-w-28 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                        <p className="font-semibold text-slate-700">{PROCESO_LABELS[p]}</p>
                        <p className="text-slate-600">
                          asignadas {resumen[p].asignado}/{Number(m.cantidad_total)}
                        </p>
                        <p className="text-slate-600">entregadas {resumen[p].entregado}</p>
                      </div>
                    ))}
                    {puedeEditar && !pedidoCancelado && (
                      <AsignarForm
                        itemId={m.id}
                        descripcion={descripcion}
                        unidad={m.unidad}
                        disponible={disponible}
                        equipos={equipos ?? []}
                      />
                    )}
                  </div>
                </div>

                {lista.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
                    {lista.map((a) => (
                      <FilaAsignacion
                        key={a.id}
                        a={a}
                        entregas={entregas.get(a.id) ?? []}
                        puedeEditar={puedeEditar}
                        puedeAnular={puedeAnular}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
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
          <span className="text-slate-600">{PROCESO_LABELS[a.proceso]}</span>
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
