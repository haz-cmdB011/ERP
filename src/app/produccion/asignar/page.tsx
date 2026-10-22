import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { leer } from "@/lib/supabase/leer";
import { agruparCarrito, MAX_ITEMS_CARRITO, type ItemCarrito } from "@/lib/produccion/carrito";
import { cargarDatosCarrito } from "@/lib/produccion/carrito-db";
import {
  PROCESO_LABELS,
  PROCESOS,
  type EncargadoEquipo,
  type EquipoProduccion,
} from "@/lib/produccion/asignaciones";
import AsignarLote from "../asignaciones/asignar-lote";

export const metadata: Metadata = { title: "Asignar a equipos" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MuebleFila {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  pedido_versiones: {
    pedido_id: string;
    pedidos: { numero_pedido: string; orden_trabajo: string | null } | null;
  } | null;
}

// Panel de asignación de lo que se acaba de liberar desde el carrito: los muebles
// liberados (ids en la URL), agrupados por O.T. y PM, para asignarlos a equipos de
// maquila de una vez. Lo que ya quedó asignado sigue a la vista, sin "por asignar".
export default async function AsignarLiberadosPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const itemIds = [...new Set((ids ?? "").split(",").filter((id) => UUID.test(id)))].slice(
    0,
    MAX_ITEMS_CARRITO
  );

  if (itemIds.length === 0) {
    return (
      <Contenedor>
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          No hay muebles para asignar.{" "}
          <Link href="/produccion/carrito" className="font-medium text-brand-700 hover:underline">
            Ir al carrito →
          </Link>
        </p>
      </Contenedor>
    );
  }

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const puedeEditar = puedeEditarProduccion(perfil);

  const [filas, datos, equipos, encargados] = await Promise.all([
    leer(
      supabase
        .from("planeacion_items")
        .select(
          "id, item_code, modelo, descripcion, cantidad_total, unidad, pedido_versiones ( pedido_id, pedidos ( numero_pedido, orden_trabajo ) )"
        )
        .in("id", itemIds)
        .eq("tipo_registro", "MO")
        .returns<MuebleFila[]>(),
      "los muebles liberados"
    ),
    cargarDatosCarrito(supabase, itemIds),
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
  ]);

  const muebles: ItemCarrito[] = (filas ?? []).flatMap((f) => {
    const pm = f.pedido_versiones?.pedidos;
    if (!f.pedido_versiones || !pm) return [];
    return [
      {
        id: f.id,
        tipo: "MO" as const,
        itemCode: f.item_code,
        modelo: f.modelo,
        descripcion: f.descripcion,
        cantidad: Number(f.cantidad_total),
        unidad: f.unidad,
        padreId: null,
        pedidoId: f.pedido_versiones.pedido_id,
        numeroPm: pm.numero_pedido,
        ot: pm.orden_trabajo,
      },
    ];
  });
  const grupos = agruparCarrito(muebles);
  const porId = new Map(datos.muebles.map((m) => [m.id, m]));
  const porAsignar = datos.muebles.filter((m) => PROCESOS.some((p) => m.disponible[p] > 0));
  const sinLiberar = muebles.filter((m) => !datos.estados[m.id]?.liberado).length;

  return (
    <Contenedor>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <span className="font-medium text-slate-900">
          {muebles.length} mueble{muebles.length === 1 ? "" : "s"} liberado
          {muebles.length === 1 ? "" : "s"} · {porAsignar.length} con algo por asignar
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {puedeEditar && porAsignar.length > 0 && (
            <AsignarLote
              muebles={datos.muebles}
              equipos={equipos ?? []}
              encargados={encargados ?? []}
              etiqueta={`Asignar todos a un equipo (${porAsignar.length})`}
            />
          )}
          <Link
            href="/produccion/carrito"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Volver al carrito
          </Link>
        </div>
      </div>

      {!puedeEditar && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Tu cuenta puede ver esto, pero asignar es del personal de Producción.
        </p>
      )}
      {puedeEditar && (equipos ?? []).length <= 1 && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          Da de alta tus equipos de maquila en{" "}
          <Link href="/produccion/equipos" className="font-medium underline">
            Equipos
          </Link>{" "}
          para poder asignarles trabajo.
        </p>
      )}
      {sinLiberar > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {sinLiberar} mueble{sinLiberar === 1 ? "" : "s"} de esta lista no está
          {sinLiberar === 1 ? "" : "n"} liberado{sinLiberar === 1 ? "" : "s"}, así que no se puede
          asignar todavía.
        </p>
      )}

      {grupos.map((g) => (
        <section key={g.ot ?? "sin-ot"} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {g.ot ? `O.T. ${g.ot}` : "Sin O.T."}
          </h2>
          {g.pms.map((pm) => {
            const delPm = datos.muebles.filter((m) => pm.items.some((i) => i.id === m.id));
            const delPmPorAsignar = delPm.filter((m) => PROCESOS.some((p) => m.disponible[p] > 0));
            return (
              <article
                key={pm.pedidoId}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <Link
                    href={`/produccion/pedidos/${pm.pedidoId}`}
                    className="font-semibold text-slate-900 hover:underline"
                  >
                    {pm.numeroPm}
                  </Link>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {puedeEditar && delPmPorAsignar.length > 0 && (
                      <AsignarLote
                        muebles={delPm}
                        equipos={equipos ?? []}
                        encargados={encargados ?? []}
                        etiqueta={`Asignar ${delPmPorAsignar.length} a un equipo`}
                      />
                    )}
                    {puedeEditar && (
                      <Link
                        href={`/produccion/pedidos/${pm.pedidoId}/asignaciones`}
                        title="Asignar por partes del despiece, ver la ruta y el avance"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Ruta y partes
                      </Link>
                    )}
                  </div>
                </header>
                <ul className="divide-y divide-slate-100">
                  {pm.items.map((i) => {
                    const m = porId.get(i.id);
                    const faltan = m ? PROCESOS.filter((p) => m.disponible[p] > 0) : [];
                    return (
                      <li key={i.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">
                            {i.itemCode}
                            {i.modelo ? ` · ${i.modelo}` : ""}
                          </p>
                          {i.descripcion && (
                            <p className="line-clamp-2 text-xs text-slate-600">
                              {i.descripcion.split("\n")[0]}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-slate-500">
                            {i.cantidad} {i.unidad ?? ""}
                          </p>
                        </div>
                        <span
                          className={`text-right text-xs font-medium ${
                            !m ? "text-slate-500" : faltan.length > 0 ? "text-amber-700" : "text-emerald-700"
                          }`}
                        >
                          {!m
                            ? "No disponible para asignar"
                            : faltan.length > 0
                              ? `Por asignar: ${faltan.map((p) => `${PROCESO_LABELS[p]} ${m.disponible[p]}`).join(", ")}`
                              : "Todo asignado"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </section>
      ))}
    </Contenedor>
  );
}

function Contenedor({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pb-24 sm:p-6 sm:pb-24">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Asignar a equipos</h1>
        <p className="mt-1 text-sm text-slate-600">
          Estos son los muebles que acabas de liberar a producción. Asígnalos a los equipos de maquila.
        </p>
      </div>
      {children}
    </main>
  );
}
