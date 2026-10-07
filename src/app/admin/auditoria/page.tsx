import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Paginacion, { TAMANO_PAGINA } from "@/components/paginacion";

interface AuditoriaRow {
  id: number;
  en: string;
  usuario_id: string | null;
  tabla: string;
  registro_id: string;
  accion: string;
  detalle: {
    numero_pedido?: string;
    item_code?: number;
    modelo?: string | null;
    motivo?: string | null;
    // Recibos de maquila (ver 20260930120000_auditoria_recibos.sql).
    folio?: string | null;
    tipo?: string | null;
    contratista?: string | null;
    ot?: string | null;
    renglones?: number;
    total?: number;
  } | null;
}

type Tono = "emerald" | "rose" | "amber" | "sky" | "slate";

const TONOS: Record<Tono, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  slate: "border-slate-300 bg-slate-100 text-slate-600",
};

// Acciones que registran los triggers (auditar_cambios), para poder buscar por
// su etiqueta legible ("pagado", "papelera"...).
const ACCIONES = [
  "cancelado",
  "cancelacion_revertida",
  "enviado_a_papelera",
  "restaurado",
  "eliminado_definitivo",
  "revision_cancelado",
  "revision_en_revision",
  "revision_normal",
  "liberacion_enviado_a_produccion",
  "liberacion_pendiente",
  "estado_cancelado",
  "estado_revisado",
  "estado_pagado",
  "estado_pendiente",
];

// Quita lo que rompería la sintaxis de filtros de PostgREST (.or) y acota la
// longitud; el texto se usa solo como patrón de coincidencia parcial.
function limpiarBusqueda(texto: string | undefined): string {
  return (texto ?? "").replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

// Etiqueta legible de cada acción que registran los triggers (auditar_cambios).
function describirAccion(accion: string): { etiqueta: string; tono: Tono } {
  switch (accion) {
    case "cancelado":
      return { etiqueta: "Pedido cancelado", tono: "slate" };
    case "cancelacion_revertida":
      return { etiqueta: "Cancelación revertida", tono: "sky" };
    case "enviado_a_papelera":
      return { etiqueta: "Enviado a papelera", tono: "amber" };
    case "restaurado":
      return { etiqueta: "Restaurado", tono: "emerald" };
    case "eliminado_definitivo":
      return { etiqueta: "Eliminado definitivamente", tono: "rose" };
    case "revision_cancelado":
      return { etiqueta: "Ítem cancelado", tono: "slate" };
    case "revision_en_revision":
      return { etiqueta: "Ítem en revisión", tono: "amber" };
    case "revision_normal":
      return { etiqueta: "Ítem vuelto a normal", tono: "sky" };
    case "liberacion_enviado_a_produccion":
      return { etiqueta: "Enviado a producción", tono: "emerald" };
    case "liberacion_pendiente":
      return { etiqueta: "Revertido a pendiente", tono: "sky" };
    case "estado_cancelado":
      return { etiqueta: "Recibo cancelado", tono: "slate" };
    case "estado_revisado":
      return { etiqueta: "Recibo revisado", tono: "sky" };
    case "estado_pagado":
      return { etiqueta: "Recibo pagado", tono: "emerald" };
    case "estado_pendiente":
      return { etiqueta: "Recibo vuelto a pendiente", tono: "amber" };
    default:
      return { etiqueta: accion, tono: "slate" };
  }
}

const FILTROS: [string, string][] = [
  ["todos", "Todos"],
  ["pedidos", "Pedidos"],
  ["planeacion_items", "Ítems"],
  ["recibos", "Recibos"],
];

const TABLAS_RECIBOS = ["recibos", "recibos_electrificacion"];
const TIPO_RECIBO: Record<string, string> = {
  acabados: "Acabados",
  armado: "Armado",
  electrificacion: "Electrificación",
};

// El acceso (solo desarrollador) ya lo valida admin/layout.tsx; además la RLS
// de public.auditoria solo deja leer a desarrolladores y administradores de área.
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ tabla?: string; pagina?: string; q?: string }>;
}) {
  const { tabla, pagina: paginaParam, q } = await searchParams;
  const busqueda = limpiarBusqueda(q);
  const filtro = FILTROS.some(([v]) => v === tabla) ? (tabla as string) : "todos";

  const supabase = await createClient();

  // Búsqueda: texto libre sobre el detalle (pedido, ítem, modelo, motivo, folio,
  // contratista, O.T.), la acción (por su etiqueta) y quien hizo el cambio.
  let condicionBusqueda: string | null = null;
  if (busqueda) {
    const patron = `*${busqueda}*`;
    const minusculas = busqueda.toLowerCase();
    const accionesQueCoinciden = ACCIONES.filter(
      (a) => describirAccion(a).etiqueta.toLowerCase().includes(minusculas) || a.includes(minusculas)
    );
    const { data: usuarios } = await supabase
      .from("perfiles")
      .select("id")
      .or(`nombre_completo.ilike.${patron},email.ilike.${patron}`)
      .returns<{ id: string }[]>();
    const partes = [
      "numero_pedido",
      "item_code",
      "modelo",
      "motivo",
      "folio",
      "contratista",
      "ot",
    ].map((campo) => `detalle->>${campo}.ilike.${patron}`);
    if (accionesQueCoinciden.length) partes.push(`accion.in.(${accionesQueCoinciden.join(",")})`);
    if (usuarios?.length) partes.push(`usuario_id.in.(${usuarios.map((u) => u.id).join(",")})`);
    condicionBusqueda = partes.join(",");
  }

  let conteoQuery = supabase.from("auditoria").select("id", { count: "exact", head: true });
  if (filtro === "recibos") conteoQuery = conteoQuery.in("tabla", TABLAS_RECIBOS);
  else if (filtro !== "todos") conteoQuery = conteoQuery.eq("tabla", filtro);
  if (condicionBusqueda) conteoQuery = conteoQuery.or(condicionBusqueda);
  const { count, error: errorConteo } = await conteoQuery;
  const total = count ?? 0;

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA));
  const pedida = Number.parseInt(paginaParam ?? "1", 10);
  const pagina = Math.min(Math.max(Number.isFinite(pedida) ? pedida : 1, 1), totalPaginas);

  let filas: AuditoriaRow[] = [];
  let error = errorConteo;
  if (total > 0 && !error) {
    let consulta = supabase
      .from("auditoria")
      .select("id, en, usuario_id, tabla, registro_id, accion, detalle")
      .order("en", { ascending: false })
      .order("id", { ascending: false })
      .range((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA - 1);
    if (filtro === "recibos") consulta = consulta.in("tabla", TABLAS_RECIBOS);
    else if (filtro !== "todos") consulta = consulta.eq("tabla", filtro);
    if (condicionBusqueda) consulta = consulta.or(condicionBusqueda);
    const { data, error: errorFilas } = await consulta.returns<AuditoriaRow[]>();
    error = errorFilas;
    filas = data ?? [];
  }

  // Nombre de quien hizo cada cambio.
  const usuarioIds = Array.from(
    new Set(filas.map((f) => f.usuario_id).filter((id): id is string => !!id))
  );
  const { data: perfiles } = usuarioIds.length
    ? await supabase
        .from("perfiles")
        .select("id, nombre_completo, email")
        .in("id", usuarioIds)
        .returns<{ id: string; nombre_completo: string | null; email: string | null }[]>()
    : { data: [] as { id: string; nombre_completo: string | null; email: string | null }[] };
  const usuarioPorId = new Map(
    (perfiles ?? []).map((p) => [p.id, p.nombre_completo || p.email || null])
  );

  const hrefPagina = (valor: string, numeroPagina = 1, conBusqueda = true) => {
    const params = new URLSearchParams();
    if (valor !== "todos") params.set("tabla", valor);
    if (busqueda && conBusqueda) params.set("q", busqueda);
    if (numeroPagina > 1) params.set("pagina", String(numeroPagina));
    const cadena = params.toString();
    return cadena ? `/admin/auditoria?${cadena}` : "/admin/auditoria";
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Auditoría</h1>
        <p className="mt-1 text-sm text-slate-500">
          Bitácora de quién hizo qué y cuándo: cancelaciones y reversiones, papelera y
          restauraciones, eliminaciones definitivas, envíos a producción y cambios de estado de
          revisión. Se registra automáticamente y no se puede editar ni borrar.
        </p>
      </div>

      <form action="/admin/auditoria" className="flex gap-2">
        {filtro !== "todos" && <input type="hidden" name="tabla" value={filtro} />}
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            name="q"
            defaultValue={busqueda}
            placeholder="Buscar por usuario, pedido, ítem, modelo, folio, motivo o acción..."
            aria-label="Buscar en la auditoría"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-brand-600 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Buscar
        </button>
        {busqueda && (
          <Link
            href={hrefPagina(filtro, 1, false)}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-brand-700 hover:underline"
          >
            Limpiar
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {FILTROS.map(([valor, etiqueta]) => (
          <Link
            key={valor}
            href={hrefPagina(valor)}
            className={`rounded border px-3 py-1 font-medium transition-colors ${
              filtro === valor
                ? "border-brand-600 bg-brand-500 text-on-brand"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {etiqueta}
          </Link>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          No se pudo cargar la bitácora: {error.message}
        </p>
      )}

      {!error && busqueda && (
        <p className="text-sm text-slate-600">
          {total === 0
            ? `Ningún evento coincide con “${busqueda}”.`
            : `${total.toLocaleString("es-MX")} evento${total === 1 ? "" : "s"} para “${busqueda}”.`}
        </p>
      )}

      {!error && filas.length === 0 && !busqueda && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay eventos registrados. Aparecerán aquí a partir de ahora.
        </p>
      )}

      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Usuario</th>
                <th className="px-3 py-2.5">Acción</th>
                <th className="px-3 py-2.5">Registro</th>
                <th className="px-3 py-2.5">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f) => {
                const { etiqueta, tono } = describirAccion(f.accion);
                const d = f.detalle ?? {};
                return (
                  <tr key={f.id} className="align-top transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {new Date(f.en).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {(f.usuario_id && usuarioPorId.get(f.usuario_id)) || "Sistema"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded border px-2.5 py-1 font-medium ${TONOS[tono]}`}
                      >
                        {etiqueta}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {f.tabla === "pedidos" ? (
                        <>Pedido {d.numero_pedido ?? "—"}</>
                      ) : TABLAS_RECIBOS.includes(f.tabla) ? (
                        <>
                          Recibo {d.folio ?? "—"} · {TIPO_RECIBO[d.tipo ?? ""] ?? d.tipo ?? "—"}
                          {d.contratista ? ` · ${d.contratista}` : ""}
                          {d.ot ? ` · OT ${d.ot}` : ""}
                        </>
                      ) : (
                        <>
                          Ítem {d.item_code ?? "—"}
                          {d.modelo ? ` — ${d.modelo}` : ""}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {TABLAS_RECIBOS.includes(f.tabla) && f.accion === "eliminado_definitivo"
                        ? `${d.renglones ?? 0} renglón${d.renglones === 1 ? "" : "es"} · $${Number(d.total ?? 0).toFixed(2)}`
                        : (d.motivo ?? "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion pagina={pagina} total={total} href={(n) => hrefPagina(filtro, n)} />
    </main>
  );
}
