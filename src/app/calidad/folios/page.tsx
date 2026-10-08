import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Paginacion, { TAMANO_PAGINA } from "@/components/paginacion";
import EstadoVacio from "@/components/estado-vacio";
import { CATEGORIAS_DEFECTO, nombreCategoria } from "@/lib/calidad/categorias";
import {
  ESTADOS_FOLIOS,
  hrefFolios,
  type EstadoFolios,
  leerFiltrosFolios,
  type FiltrosFolios,
  type ParametrosFolios,
} from "@/lib/calidad/folios-filtros";
import { aplicarFiltrosFolios } from "@/lib/calidad/folios-consulta";
import { formatoFechaHora } from "@/lib/resumen/entrega";

import { leer } from "@/lib/supabase/leer";
interface ItemVivo {
  id: string;
  item_code: number;
  modelo: string | null;
  tipo_material: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  estado_revision: string | null;
  eliminacion_solicitada_en: string | null;
  pedido_versiones: {
    pedidos: {
      id: string;
      numero_pedido: string;
      eliminado_en: string | null;
      cancelado_en: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    } | null;
  } | null;
}

interface InformeRow {
  id: string;
  folio: string;
  aprobado: boolean;
  descripcion: string | null;
  elaborado_por: string | null;
  elaborado_en: string;
  categoria: string | null;
  planeacion_items: ItemVivo | ItemVivo[] | null;
}

type Tono = "emerald" | "rose" | "amber" | "slate";

const TONOS: Record<Tono, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  slate: "border-slate-300 bg-slate-100 text-slate-600",
};

// Situación actual del ítem evaluado. El folio de Calidad nunca se pierde:
// si el ítem o su pedido se eliminan o cancelan, el informe sigue existiendo
// (ver eliminar_item_definitivo / eliminar_pedido_definitivo) y aquí solo
// cambia esta nota.
function situacionDe(item: ItemVivo | null): { etiqueta: string; tono: Tono } | null {
  if (!item) return { etiqueta: "Ítem no disponible", tono: "slate" };
  const pedido = item.pedido_versiones?.pedidos ?? null;
  if (pedido?.eliminado_en) return { etiqueta: "Pedido eliminado", tono: "amber" };
  if (item.eliminacion_solicitada_en) return { etiqueta: "Ítem eliminado", tono: "amber" };
  if (item.estado_revision === "cancelado" || pedido?.cancelado_en) {
    return { etiqueta: "Cancelado", tono: "slate" };
  }
  return null;
}

function unico<T>(valor: T | T[] | null): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor;
}

export default async function FoliosCalidadPage({
  searchParams,
}: {
  searchParams: Promise<ParametrosFolios>;
}) {
  const filtros = leerFiltrosFolios(await searchParams);
  const { q: termino, estado: filtro } = filtros;

  const supabase = await createClient();

  // Filtros comunes a los conteos y a la lista (vista informes_calidad_estado),
  // así el buscador escala sin importar cuántos informes haya: solo se traen
  // los de la página.
  const conFiltros = <T extends Parameters<typeof aplicarFiltrosFolios>[0]>(consulta: T, estado: EstadoFolios): T =>
    aplicarFiltrosFolios(consulta, filtros, estado);
  const contar = async (clave: EstadoFolios) => {
    const { count, error: errorConteo } = await conFiltros(
      supabase.from("informes_calidad_estado").select("id", { count: "exact", head: true }),
      clave
    );
    return { count: count ?? 0, error: errorConteo };
  };
  const [cTodos, cAprobados, cNoAprobados, cCancelados] = await Promise.all([
    contar("todos"),
    contar("aprobados"),
    contar("no_aprobados"),
    contar("cancelados"),
  ]);
  const conteo = {
    todos: cTodos.count,
    aprobados: cAprobados.count,
    no_aprobados: cNoAprobados.count,
    cancelados: cCancelados.count,
  };
  let error = cTodos.error ?? cAprobados.error ?? cNoAprobados.error ?? cCancelados.error;

  const total = conteo[filtro];
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA));
  const pagina = Math.min(filtros.pagina, totalPaginas);

  let data: InformeRow[] | null = [];
  if (total > 0 && !error) {
    const idsQuery = conFiltros(
      supabase
        .from("informes_calidad_estado")
        .select("id")
        .order("elaborado_en", { ascending: false })
        .order("folio", { ascending: false })
        .range((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA - 1),
      filtro
    );
    const { data: idsPagina, error: errorIds } = await idsQuery.returns<{ id: string }[]>();
    error = errorIds;

    if (!errorIds && idsPagina && idsPagina.length > 0) {
      const ids = idsPagina.map((r) => r.id);
      const { data: detalle, error: errorDetalle } = await supabase
        .from("informes_calidad")
        .select(
          "id, folio, aprobado, descripcion, categoria, elaborado_por, elaborado_en, planeacion_items ( id, item_code, modelo, tipo_material, descripcion, cantidad_total, unidad, estado_revision, eliminacion_solicitada_en, pedido_versiones ( pedidos ( id, numero_pedido, eliminado_en, cancelado_en, proyectos ( nombre, cliente ) ) ) )"
        )
        .in("id", ids)
        .returns<InformeRow[]>();
      error = errorDetalle;
      const orden = new Map(ids.map((id, i) => [id, i]));
      data = (detalle ?? []).sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));
    }
  }

  // Nombre de quien elaboró cada informe (perfiles es legible por cualquier
  // usuario autenticado).
  const autorIds = Array.from(
    new Set((data ?? []).map((i) => i.elaborado_por).filter((id): id is string => !!id))
  );
  const { data: perfiles } = autorIds.length
    ? await supabase
        .from("perfiles")
        .select("id, nombre_completo, email")
        .in("id", autorIds)
        .returns<{ id: string; nombre_completo: string | null; email: string | null }[]>()
    : { data: [] as { id: string; nombre_completo: string | null; email: string | null }[] };
  const autorPorId = new Map(
    (perfiles ?? []).map((p) => [p.id, p.nombre_completo || p.email || null])
  );

  // Folio de producción (PRD-…) de cada ítem evaluado, para cruzar ambos folios.
  const itemIds = Array.from(
    new Set(
      (data ?? [])
        .map((i) => unico(i.planeacion_items)?.id)
        .filter((id): id is string => !!id)
    )
  );
  const foliosProd = itemIds.length
    ? await leer(
        supabase
        .from("folios_produccion")
        .select("planeacion_item_id, folio")
        .in("planeacion_item_id", itemIds)
        .returns<{ planeacion_item_id: string; folio: string }[]>(),
        "folios_produccion"
      )
    : [] as { planeacion_item_id: string; folio: string }[];
  const folioProdPorItem = new Map((foliosProd ?? []).map((f) => [f.planeacion_item_id, f.folio]));

  const filas = (data ?? []).map((inf) => {
    const item = unico(inf.planeacion_items);
    return { inf, item, situacion: situacionDe(item) };
  });

  const visibles = filas;

  const hrefFiltro = (cambios: Partial<FiltrosFolios>) => hrefFolios({ ...filtros, ...cambios });
  // La descarga en Excel lleva los mismos filtros (sin página).
  const hayFiltros = !!(termino || filtros.desde || filtros.hasta || filtros.categoria);
  const hrefExcel = hrefFolios({ ...filtros, pagina: 1 }, "/api/calidad/folios/excel");

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Folios de calidad</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada evaluación de Calidad (aprobada o no) genera un folio único e inmutable. Un mismo
          ítem puede tener varios folios a lo largo del tiempo; si el ítem o el pedido se cancelan
          o eliminan, el folio se conserva y aquí aparece marcado.
        </p>
      </div>

      <form method="get" action="/calidad/folios" className="flex flex-wrap items-end gap-3">
        {filtro !== "todos" && <input type="hidden" name="estado" value={filtro} />}
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Folio
          <input
            type="search"
            name="q"
            defaultValue={termino}
            placeholder="CAL-000123 o solo 123"
            autoComplete="off"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:border-slate-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={filtros.desde ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={filtros.hasta ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Defecto
          <select
            name="categoria"
            defaultValue={filtros.categoria ?? ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
          >
            <option value="">Todos</option>
            {CATEGORIAS_DEFECTO.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
        >
          Filtrar
        </button>
        {hayFiltros && (
          <Link
            href={hrefFolios({ estado: filtro })}
            className="py-2 text-sm text-slate-500 underline hover:text-slate-700"
          >
            Limpiar
          </Link>
        )}
        {total > 0 && (
          <a
            href={hrefExcel}
            className="ml-auto rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Descargar Excel ({total})
          </a>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {ESTADOS_FOLIOS.map(([valor, etiqueta]) => (
          <Link
            key={valor}
            href={hrefFiltro({ estado: valor, pagina: 1 })}
            className={`rounded border px-3 py-1 font-medium transition-colors ${
              filtro === valor
                ? "border-brand-600 bg-brand-500 text-on-brand"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {etiqueta} ({conteo[valor]})
          </Link>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          No se pudieron cargar los folios: {error.message}
        </p>
      )}

      {!error && visibles.length === 0 && (
        <EstadoVacio
          titulo={hayFiltros || filtro !== "todos" ? "Ningún folio coincide" : "Todavía no hay folios"}
          descripcion={
            hayFiltros || filtro !== "todos"
              ? "Prueba con otras fechas, otro folio o quita los filtros."
              : "Se generan al evaluar un ítem desde un pedido."
          }
          accion={
            hayFiltros || filtro !== "todos"
              ? { href: "/calidad/folios", etiqueta: "Quitar filtros" }
              : { href: "/calidad", etiqueta: "Ir a Pedidos" }
          }
        />
      )}

      {visibles.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Folio</th>
                <th className="px-3 py-2.5">Resultado</th>
                <th className="px-3 py-2.5">Folio producción</th>
                <th className="px-3 py-2.5">Pedido</th>
                <th className="px-3 py-2.5">Ítem</th>
                <th className="px-3 py-2.5">Material</th>
                <th className="px-3 py-2.5">Observaciones</th>
                <th className="px-3 py-2.5">Elaboró</th>
                <th className="px-3 py-2.5">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map(({ inf, item, situacion }) => {
                const pedido = item?.pedido_versiones?.pedidos ?? null;
                // Las páginas de pedido/informe de Calidad devuelven 404 para
                // pedidos eliminados, así que ahí no se enlaza.
                const enlazable = pedido && !pedido.eliminado_en;
                return (
                  <tr key={inf.id} className="align-top transition-colors hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-sm text-slate-900">
                      {enlazable ? (
                        <Link
                          href={`/calidad/pedidos/${pedido.id}/informe/${inf.id}`}
                          className="hover:text-brand-700 hover:underline"
                        >
                          {inf.folio}
                        </Link>
                      ) : (
                        inf.folio
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded border px-2.5 py-1 font-medium ${
                          inf.aprobado ? TONOS.emerald : TONOS.rose
                        }`}
                      >
                        {inf.aprobado ? "Aprobado" : "No aprobado"}
                      </span>
                      {!inf.aprobado && nombreCategoria(inf.categoria) && (
                        <p className="mt-1 text-[11px] font-medium text-rose-600">
                          {nombreCategoria(inf.categoria)}
                        </p>
                      )}
                      {situacion && (
                        <p className="mt-1">
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${TONOS[situacion.tono]}`}
                          >
                            {situacion.etiqueta}
                          </span>
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">
                      {(item && folioProdPorItem.get(item.id)) || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {enlazable ? (
                        <Link
                          href={`/calidad/pedidos/${pedido.id}`}
                          className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {pedido.numero_pedido}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">
                          {pedido?.numero_pedido ?? "—"}
                        </span>
                      )}
                      <p className="text-[11px] text-slate-500">
                        {pedido?.proyectos?.nombre ?? "—"} — {pedido?.proyectos?.cliente ?? "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {item ? item.item_code : "—"}
                      {item?.modelo ? ` — ${item.modelo}` : ""}
                      {item?.descripcion && (
                        <p className="max-w-[220px] text-[11px] text-slate-500">
                          {item.descripcion}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{item?.tipo_material ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{inf.descripcion ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {(inf.elaborado_por && autorPorId.get(inf.elaborado_por)) || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {formatoFechaHora(inf.elaborado_en)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion pagina={pagina} total={total} href={(n) => hrefFiltro({ pagina: n })} />
    </main>
  );
}
