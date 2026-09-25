import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getPerfilActual,
  puedeAdministrarPlaneacion,
  puedeEditarPlaneacion,
} from "@/lib/auth/get-perfil";
import {
  RestaurarItemBoton,
  RestaurarPedidoBoton,
  RevertirItemBoton,
} from "@/components/revertir-cancelacion";
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
  estado_liberacion: string;
  pedido_versiones: {
    pedidos: {
      id: string;
      eliminado_en: string | null;
      cancelado_en: string | null;
    } | null;
  } | null;
}

interface FolioRow {
  id: string;
  folio: string;
  planeacion_item_id: string | null;
  generado_en: string;
  numero_pedido: string | null;
  proyecto: string | null;
  cliente: string | null;
  item_code: number | null;
  modelo: string | null;
  tipo_material: string | null;
  descripcion: string | null;
  cantidad_total: number | null;
  unidad: string | null;
  planeacion_items: ItemVivo | ItemVivo[] | null;
}

interface InformeResumen {
  planeacion_item_id: string;
  folio: string;
  aprobado: boolean;
  elaborado_en: string;
}

type Grupo = "activos" | "eliminados" | "cancelados";
type Tono = "emerald" | "sky" | "amber" | "rose" | "slate";

interface EstadoFolio {
  etiqueta: string;
  detalle: string | null;
  tono: Tono;
  grupo: Grupo;
}

const TONOS: Record<Tono, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  slate: "border-slate-300 bg-slate-100 text-slate-600",
};

function estadoDe(item: ItemVivo | null): EstadoFolio {
  // Sin ítem vivo: se borró definitivamente (o su pedido), pero el folio se
  // conserva en el registro con la copia de sus datos.
  if (!item) {
    return {
      etiqueta: "Eliminado",
      detalle: "Borrado definitivamente — el folio se conserva",
      tono: "rose",
      grupo: "eliminados",
    };
  }
  const pedido = item.pedido_versiones?.pedidos ?? null;
  if (pedido?.eliminado_en) {
    return {
      etiqueta: "Pedido eliminado",
      detalle: "Se puede restaurar; conserva el mismo folio",
      tono: "amber",
      grupo: "eliminados",
    };
  }
  if (item.eliminacion_solicitada_en) {
    return {
      etiqueta: "Ítem eliminado",
      detalle: "En papelera; conserva el mismo folio",
      tono: "amber",
      grupo: "eliminados",
    };
  }
  if (item.estado_revision === "cancelado" || pedido?.cancelado_en) {
    return { etiqueta: "Cancelado", detalle: null, tono: "slate", grupo: "cancelados" };
  }
  if (item.estado_liberacion === "enviado_a_produccion") {
    return { etiqueta: "Activo", detalle: "En producción", tono: "emerald", grupo: "activos" };
  }
  return {
    etiqueta: "Activo",
    detalle: "Revertido a pendiente",
    tono: "sky",
    grupo: "activos",
  };
}

function unico<T>(valor: T | T[] | null): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor;
}

const FILTROS: [string, string][] = [
  ["todos", "Todos"],
  ["activos", "Activos"],
  ["eliminados", "Eliminados"],
  ["cancelados", "Cancelados"],
];

export default async function BuscarFolioPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
}) {
  const { q, estado, pagina: paginaParam } = await searchParams;
  const termino = (q ?? "").trim();
  const filtro = FILTROS.some(([v]) => v === estado) ? (estado as string) : "todos";

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  // Mismos permisos que el panel Cancelados de Producción: ítems
  // (restaurar/revertir) → Producción o Planeación; restaurar un PM eliminado
  // → administrador de Planeación o desarrollador.
  const esProduccion =
    perfil?.rol === "desarrollador" ||
    (perfil?.area === "produccion" && (perfil.rol === "administrador" || perfil.rol === "trabajador"));
  const puedeEditar = esProduccion || puedeEditarPlaneacion(perfil);
  const puedeRestaurarPedido = puedeAdministrarPlaneacion(perfil);

  // Escapa los comodines de LIKE para que se busque el texto tal cual.
  const literal = termino.replace(/[\\%_]/g, (c) => `\\${c}`);

  // Filtra y cuenta en la base (vista folios_produccion_estado: id, folio,
  // generado_en y grupo activos/eliminados/cancelados), así el buscador
  // escala sin importar cuántos folios haya: solo se traen los de la página.
  const contar = async (grupo: string | null) => {
    let c = supabase
      .from("folios_produccion_estado")
      .select("id", { count: "exact", head: true });
    if (termino) c = c.ilike("folio", `%${literal}%`);
    if (grupo) c = c.eq("grupo", grupo);
    const { count, error: errorConteo } = await c;
    return { count: count ?? 0, error: errorConteo };
  };
  const [cTodos, cActivos, cEliminados, cCancelados] = await Promise.all([
    contar(null),
    contar("activos"),
    contar("eliminados"),
    contar("cancelados"),
  ]);
  const conteo = {
    todos: cTodos.count,
    activos: cActivos.count,
    eliminados: cEliminados.count,
    cancelados: cCancelados.count,
  };
  let error = cTodos.error;

  const total = conteo[filtro as keyof typeof conteo];
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA));
  const pedida = Number.parseInt(paginaParam ?? "1", 10);
  const pagina = Math.min(Math.max(Number.isFinite(pedida) ? pedida : 1, 1), totalPaginas);

  let data: FolioRow[] | null = [];
  if (total > 0 && !error) {
    let idsQuery = supabase
      .from("folios_produccion_estado")
      .select("id")
      .order("generado_en", { ascending: false })
      .order("folio", { ascending: false })
      .range((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA - 1);
    if (termino) idsQuery = idsQuery.ilike("folio", `%${literal}%`);
    if (filtro !== "todos") idsQuery = idsQuery.eq("grupo", filtro);
    const { data: idsPagina, error: errorIds } = await idsQuery.returns<{ id: string }[]>();
    error = errorIds;

    if (!errorIds && idsPagina && idsPagina.length > 0) {
      const ids = idsPagina.map((r) => r.id);
      const { data: detalle, error: errorDetalle } = await supabase
        .from("folios_produccion")
        .select(
          "id, folio, planeacion_item_id, generado_en, numero_pedido, proyecto, cliente, item_code, modelo, tipo_material, descripcion, cantidad_total, unidad, planeacion_items ( id, item_code, modelo, tipo_material, descripcion, cantidad_total, unidad, estado_revision, eliminacion_solicitada_en, estado_liberacion, pedido_versiones ( pedidos ( id, eliminado_en, cancelado_en ) ) )"
        )
        .in("id", ids)
        .returns<FolioRow[]>();
      error = errorDetalle;
      const orden = new Map(ids.map((id, i) => [id, i]));
      data = (detalle ?? []).sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));
    }
  }

  const filas = (data ?? []).map((f) => {
    const item = unico(f.planeacion_items);
    return { f, item, estado: estadoDe(item) };
  });

  // Informes de Calidad (CAL-…) de cada ítem, para cruzar ambos folios: se
  // muestra el más reciente y cuántos hay en total.
  const itemIds = filas.map((x) => x.item?.id).filter((id): id is string => !!id);
  const { data: informes } = itemIds.length
    ? await supabase
        .from("informes_calidad")
        .select("planeacion_item_id, folio, aprobado, elaborado_en")
        .in("planeacion_item_id", itemIds)
        .order("elaborado_en", { ascending: false })
        .returns<InformeResumen[]>()
    : { data: [] as InformeResumen[] };
  const informesPorItem = new Map<string, InformeResumen[]>();
  for (const inf of informes ?? []) {
    const lista = informesPorItem.get(inf.planeacion_item_id) ?? [];
    lista.push(inf);
    informesPorItem.set(inf.planeacion_item_id, lista);
  }

  const visibles = filas;

  const hrefFiltro = (valor: string, numeroPagina = 1) => {
    const params = new URLSearchParams();
    if (termino) params.set("q", termino);
    if (valor !== "todos") params.set("estado", valor);
    if (numeroPagina > 1) params.set("pagina", String(numeroPagina));
    const cadena = params.toString();
    return cadena ? `/produccion/folios?${cadena}` : "/produccion/folios";
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Folios de producción
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada ítem recibe un folio único al enviarse a producción. El folio no cambia ni se pierde:
          si el ítem o el pedido se borran, el folio sigue existiendo y aquí aparece como eliminado;
          si se restauran, conservan el mismo folio.
        </p>
      </div>

      <form method="get" action="/produccion/folios" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={termino}
          placeholder="Folio, por ejemplo PRD-000123 o solo 123"
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
            href={filtro === "todos" ? "/produccion/folios" : `/produccion/folios?estado=${filtro}`}
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
            : "Todavía no hay folios: se generan al enviar ítems a producción."}
        </p>
      )}

      {visibles.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Folio</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Pedido</th>
                <th className="px-3 py-2.5">Ítem</th>
                <th className="px-3 py-2.5">Material</th>
                <th className="px-3 py-2.5">Descripción</th>
                <th className="px-3 py-2.5">Cant.</th>
                <th className="px-3 py-2.5">Calidad</th>
                <th className="px-3 py-2.5">Generado</th>
                {puedeEditar && <th className="px-3 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map(({ f, item, estado: est }) => {
                const pedido = item?.pedido_versiones?.pedidos ?? null;
                // Datos vivos si el ítem existe; si no, la copia guardada.
                const codigo = item?.item_code ?? f.item_code;
                const modelo = item?.modelo ?? f.modelo;
                const material = item?.tipo_material ?? f.tipo_material;
                const descripcion = item?.descripcion ?? f.descripcion;
                const cantidad = item?.cantidad_total ?? f.cantidad_total;
                const unidad = item?.unidad ?? f.unidad;
                return (
                  <tr key={f.id} className="align-top transition-colors hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-sm text-slate-900">
                      {f.folio}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded border px-2.5 py-1 font-medium ${TONOS[est.tono]}`}
                      >
                        {est.etiqueta}
                      </span>
                      {est.detalle && (
                        <p className="mt-1 max-w-[180px] text-[11px] text-slate-500">{est.detalle}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {pedido && !pedido.eliminado_en ? (
                        <Link
                          href={`/produccion/pedidos/${pedido.id}`}
                          className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                        >
                          {f.numero_pedido ?? "—"}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">{f.numero_pedido ?? "—"}</span>
                      )}
                      <p className="text-[11px] text-slate-500">
                        {f.proyecto ?? "—"} — {f.cliente ?? "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {codigo ?? "—"}
                      {modelo ? ` — ${modelo}` : ""}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{material ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{descripcion ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {cantidad ?? "—"} {unidad}
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const lista = item ? (informesPorItem.get(item.id) ?? []) : [];
                        const ultimo = lista[0];
                        if (!ultimo) return <span className="text-slate-400">Sin evaluar</span>;
                        return (
                          <>
                            <span
                              className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${
                                ultimo.aprobado ? TONOS.emerald : TONOS.rose
                              }`}
                            >
                              {ultimo.aprobado ? "Aprobado" : "No aprobado"}
                            </span>
                            <p className="mt-1 font-mono text-[11px] text-slate-500">
                              {ultimo.folio}
                              {lista.length > 1 ? ` (+${lista.length - 1})` : ""}
                            </p>
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(f.generado_en).toLocaleDateString("es-MX")}
                    </td>
                    {puedeEditar && (
                      <td className="px-3 py-2">
                        {item && pedido?.eliminado_en ? (
                          puedeRestaurarPedido ? (
                            <RestaurarPedidoBoton pedidoId={pedido.id} />
                          ) : null
                        ) : item?.eliminacion_solicitada_en ? (
                          <RestaurarItemBoton itemId={item.id} />
                        ) : item?.estado_revision === "cancelado" ? (
                          <RevertirItemBoton itemId={item.id} />
                        ) : null}
                      </td>
                    )}
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
