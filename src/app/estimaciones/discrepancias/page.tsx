import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeDecidirDiscrepancias } from "@/lib/auth/get-perfil";
import Paginacion, { TAMANO_PAGINA } from "@/components/paginacion";
import { AREA_RECIBO_LABELS, type AreaRecibo } from "@/lib/estimaciones/discrepancias-db";
import DecidirBotones from "./decidir-botones";

interface DiscrepanciaRow {
  id: string;
  area: AreaRecibo;
  modelo: string;
  cantidad_capturada: number;
  cantidad_acumulada: number | null;
  cantidad_pm: number | null;
  motivo: string;
  creado_por: string;
  creado_en: string;
  estado: "pendiente" | "aceptada" | "rechazada";
  resuelta_en: string | null;
  nota_resolucion: string | null;
  recibos: { folio: string } | null;
  recibos_electrificacion: { folio: string } | null;
}

const AREAS = Object.keys(AREA_RECIBO_LABELS) as AreaRecibo[];

const FILTROS: [string, string][] = [
  ["pendientes", "Pendientes"],
  ["aceptadas", "Aceptadas"],
  ["rechazadas", "No aceptadas"],
  ["todas", "Todas"],
];

const ESTADO_POR_FILTRO: Record<string, string> = {
  pendientes: "pendiente",
  aceptadas: "aceptada",
  rechazadas: "rechazada",
};

// Bandeja donde el administrador de Estimaciones (o un desarrollador) acepta o
// rechaza el motivo de las diferencias con el PM de los recibos de Acabados,
// Armado y Electrificación. La función de decisión lo exige también en la
// base. Se llenan al guardar un renglón cuyo modelo no está en el PM de la OT
// o cuya cantidad acumulada supera lo que declaró Planeación.
export default async function DiscrepanciasPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; area?: string; pagina?: string }>;
}) {
  const { filtro: filtroParam, area: areaParam, pagina: paginaParam } = await searchParams;
  const filtro = FILTROS.some(([v]) => v === filtroParam) ? (filtroParam as string) : "pendientes";
  const area = AREAS.includes(areaParam as AreaRecibo) ? (areaParam as AreaRecibo) : null;

  const supabase = await createClient();
  if (!puedeDecidirDiscrepancias(await getPerfilActual(supabase))) {
    redirect("/estimaciones");
  }

  let conteoQuery = supabase
    .from("discrepancias_pm")
    .select("id", { count: "exact", head: true });
  if (ESTADO_POR_FILTRO[filtro]) conteoQuery = conteoQuery.eq("estado", ESTADO_POR_FILTRO[filtro]);
  if (area) conteoQuery = conteoQuery.eq("area", area);
  const { count, error: errorConteo } = await conteoQuery;
  const total = count ?? 0;

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA));
  const pedida = Number.parseInt(paginaParam ?? "1", 10);
  const pagina = Math.min(Math.max(Number.isFinite(pedida) ? pedida : 1, 1), totalPaginas);

  let filas: DiscrepanciaRow[] = [];
  let error = errorConteo;
  if (total > 0 && !error) {
    let consulta = supabase
      .from("discrepancias_pm")
      .select(
        "id, area, modelo, cantidad_capturada, cantidad_acumulada, cantidad_pm, " +
          "motivo, creado_por, creado_en, estado, resuelta_en, nota_resolucion, " +
          "recibos(folio), recibos_electrificacion(folio)"
      )
      .order("creado_en", { ascending: false })
      .range((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA - 1);
    if (ESTADO_POR_FILTRO[filtro]) consulta = consulta.eq("estado", ESTADO_POR_FILTRO[filtro]);
    if (area) consulta = consulta.eq("area", area);
    const { data, error: errorFilas } = await consulta.returns<DiscrepanciaRow[]>();
    error = errorFilas;
    filas = data ?? [];
  }

  const usuarioIds = Array.from(new Set(filas.map((f) => f.creado_por)));
  const { data: perfiles } = usuarioIds.length
    ? await supabase
        .from("perfiles")
        .select("id, nombre_completo, contratista, email")
        .in("id", usuarioIds)
        .returns<{ id: string; nombre_completo: string | null; contratista: string | null; email: string | null }[]>()
    : { data: [] as { id: string; nombre_completo: string | null; contratista: string | null; email: string | null }[] };
  const usuarioPorId = new Map(
    (perfiles ?? []).map((p) => [p.id, p.contratista || p.nombre_completo || p.email || null])
  );

  const hrefPagina = (valor: string, numeroPagina = 1, areaHref: AreaRecibo | null = area) => {
    const params = new URLSearchParams();
    if (valor !== "pendientes") params.set("filtro", valor);
    if (areaHref) params.set("area", areaHref);
    if (numeroPagina > 1) params.set("pagina", String(numeroPagina));
    const cadena = params.toString();
    return cadena ? `/estimaciones/discrepancias?${cadena}` : "/estimaciones/discrepancias";
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Discrepancias con el PM
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Renglones de Acabados, Armado y Electrificación cuyo modelo no está en el PM de la OT o
          cuya cantidad acumulada supera lo que declaró Planeación. Revisa el motivo: si es válido,
          acéptalo y el recibo se puede pagar; si no, recházalo explicando por qué (ese renglón solo
          se paga con precio aceptado en 0).
        </p>
      </div>

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
        <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Área</span>
        {[null, ...AREAS].map((a) => (
          <Link
            key={a ?? "todas"}
            href={hrefPagina(filtro, 1, a)}
            className={`rounded border px-3 py-1 font-medium transition-colors ${
              area === a
                ? "border-brand-600 bg-brand-500 text-on-brand"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {a ? AREA_RECIBO_LABELS[a] : "Todas"}
          </Link>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          No se pudo cargar la bandeja: {error.message}
        </p>
      )}

      {!error && filas.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {filtro === "pendientes"
            ? "No hay discrepancias pendientes."
            : "No hay discrepancias en esta vista."}
        </p>
      )}

      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Recibo</th>
                <th className="px-3 py-2.5">Área</th>
                <th className="px-3 py-2.5">Modelo</th>
                <th className="px-3 py-2.5 text-right">Capturada</th>
                <th className="px-3 py-2.5 text-right">Acumulada</th>
                <th className="px-3 py-2.5 text-right">PM declara</th>
                <th className="px-3 py-2.5">Motivo</th>
                <th className="px-3 py-2.5">Capturó</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f) => {
                const folio = f.recibos?.folio ?? f.recibos_electrificacion?.folio ?? null;
                return (
                <tr key={f.id} className="align-top transition-colors hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {new Date(f.creado_en).toLocaleString("es-MX", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    {folio ? (
                      <Link
                        href={`/estimaciones/revision/${f.area}/${encodeURIComponent(folio)}`}
                        className="font-mono font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {folio}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {AREA_RECIBO_LABELS[f.area]}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-700">{f.modelo}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {f.cantidad_capturada}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {f.cantidad_acumulada ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {f.cantidad_pm ?? (
                      <span className="text-rose-600" title="El modelo no existe en el PM de esa OT">
                        no está en el PM
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{f.motivo}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {usuarioPorId.get(f.creado_por) ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {f.estado === "pendiente" ? (
                      <DecidirBotones id={f.id} />
                    ) : (
                      <div className="flex flex-col items-end gap-0.5 text-[11px] text-slate-400">
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${
                            f.estado === "aceptada"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-rose-50 text-rose-700 ring-rose-200"
                          }`}
                        >
                          {f.estado === "aceptada" ? "Aceptada" : "No aceptada"}
                        </span>
                        {f.nota_resolucion && <span className="max-w-[12rem]">{f.nota_resolucion}</span>}
                      </div>
                    )}
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
