import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Paginacion, { TAMANO_PAGINA } from "@/components/paginacion";

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

const FILTROS: [string, string][] = [
  ["todos", "Todos"],
  ["aprobados", "Aprobados"],
  ["no_aprobados", "No aprobados"],
  ["cancelados", "Cancelados / eliminados"],
];

export default async function FoliosCalidadPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
}) {
  const { q, estado, pagina: paginaParam } = await searchParams;
  const termino = (q ?? "").trim();
  const filtro = FILTROS.some(([v]) => v === estado) ? (estado as string) : "todos";

  const supabase = await createClient();

  // Escapa los comodines de LIKE para que se busque el texto tal cual.
  const literal = termino.replace(/[\\%_]/g, (c) => `\\${c}`);

  // Filtra y cuenta en la base (vista informes_calidad_estado: id, folio,
  // aprobado, elaborado_en y con_situacion), así el buscador escala sin
  // importar cuántos informes haya: solo se traen los de la página.
  const contar = async (clave: string) => {
    let c = supabase
      .from("informes_calidad_estado")
      .select("id", { count: "exact", head: true });
    if (termino) c = c.ilike("folio", `%${literal}%`);
    if (clave === "aprobados") c = c.eq("aprobado", true);
    if (clave === "no_aprobados") c = c.eq("aprobado", false);
    if (clave === "cancelados") c = c.eq("con_situacion", true);
    const { count, error: errorConteo } = await c;
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
  let error = cTodos.error;

  const total = conteo[filtro as keyof typeof conteo];
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA));
  const pedida = Number.parseInt(paginaParam ?? "1", 10);
  const pagina = Math.min(Math.max(Number.isFinite(pedida) ? pedida : 1, 1), totalPaginas);

  let data: InformeRow[] | null = [];
  if (total > 0 && !error) {
    let idsQuery = supabase
      .from("informes_calidad_estado")
      .select("id")
      .order("elaborado_en", { ascending: false })
      .order("folio", { ascending: false })
      .range((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA - 1);
    if (termino) idsQuery = idsQuery.ilike("folio", `%${literal}%`);
    if (filtro === "aprobados") idsQuery = idsQuery.eq("aprobado", true);
    if (filtro === "no_aprobados") idsQuery = idsQuery.eq("aprobado", false);
    if (filtro === "cancelados") idsQuery = idsQuery.eq("con_situacion", true);
    const { data: idsPagina, error: errorIds } = await idsQuery.returns<{ id: string }[]>();
    error = errorIds;

    if (!errorIds && idsPagina && idsPagina.length > 0) {
      const ids = idsPagina.map((r) => r.id);
      const { data: detalle, error: errorDetalle } = await supabase
        .from("informes_calidad")
        .select(
          "id, folio, aprobado, descripcion, elaborado_por, elaborado_en, planeacion_items ( id, item_code, modelo, tipo_material, descripcion, cantidad_total, unidad, estado_revision, eliminacion_solicitada_en, pedido_versiones ( pedidos ( id, numero_pedido, eliminado_en, cancelado_en, proyectos ( nombre, cliente ) ) ) )"
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
  const { data: foliosProd } = itemIds.length
    ? await supabase
        .from("folios_produccion")
        .select("planeacion_item_id, folio")
        .in("planeacion_item_id", itemIds)
        .returns<{ planeacion_item_id: string; folio: string }[]>()
    : { data: [] as { planeacion_item_id: string; folio: string }[] };
  const folioProdPorItem = new Map((foliosProd ?? []).map((f) => [f.planeacion_item_id, f.folio]));

  const filas = (data ?? []).map((inf) => {
    const item = unico(inf.planeacion_items);
    return { inf, item, situacion: situacionDe(item) };
  });

  const visibles = filas;

  const hrefFiltro = (valor: string, numeroPagina = 1) => {
    const params = new URLSearchParams();
    if (termino) params.set("q", termino);
    if (valor !== "todos") params.set("estado", valor);
    if (numeroPagina > 1) params.set("pagina", String(numeroPagina));
    const cadena = params.toString();
    return cadena ? `/calidad/folios?${cadena}` : "/calidad/folios";
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Folios de calidad</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada evaluación de Calidad (aprobada o no) genera un folio único e inmutable. Un mismo
          ítem puede tener varios folios a lo largo del tiempo; si el ítem o el pedido se cancelan
          o eliminan, el folio se conserva y aquí aparece marcado.
        </p>
      </div>

      <form method="get" action="/calidad/folios" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={termino}
          placeholder="Folio, por ejemplo CAL-000123 o solo 123"
          autoComplete="off"
          className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
        />
        {filtro !== "todos" && <input type="hidden" name="estado" value={filtro} />}
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
        >
          Buscar
        </button>
        {termino && (
          <Link
            href={filtro === "todos" ? "/calidad/folios" : `/calidad/folios?estado=${filtro}`}
            className="text-sm text-slate-500 underline hover:text-slate-700"
          >
            Limpiar
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {FILTROS.map(([valor, etiqueta]) => (
          <Link
            key={valor}
            href={hrefFiltro(valor)}
            className={`rounded border px-3 py-1 font-medium transition-colors ${
              filtro === valor
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {etiqueta} ({conteo[valor as keyof typeof conteo]})
          </Link>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          No se pudieron cargar los folios: {error.message}
        </p>
      )}

      {!error && visibles.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {termino
            ? `No se encontró ningún folio que coincida con "${termino}".`
            : filtro !== "todos"
              ? "No hay folios en este filtro."
              : "Todavía no hay folios: se generan al evaluar un ítem desde un pedido."}
        </p>
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
                          className="hover:text-indigo-600 hover:underline"
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
                          className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
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
                      {new Date(inf.elaborado_en).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion pagina={pagina} total={total} href={(n) => hrefFiltro(filtro, n)} />
    </main>
  );
}
