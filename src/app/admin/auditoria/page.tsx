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
    default:
      return { etiqueta: accion, tono: "slate" };
  }
}

const FILTROS: [string, string][] = [
  ["todos", "Todos"],
  ["pedidos", "Pedidos"],
  ["planeacion_items", "Ítems"],
];

// El acceso (solo desarrollador) ya lo valida admin/layout.tsx; además la RLS
// de public.auditoria solo deja leer a desarrolladores y administradores de área.
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ tabla?: string; pagina?: string }>;
}) {
  const { tabla, pagina: paginaParam } = await searchParams;
  const filtro = FILTROS.some(([v]) => v === tabla) ? (tabla as string) : "todos";

  const supabase = await createClient();

  let conteoQuery = supabase.from("auditoria").select("id", { count: "exact", head: true });
  if (filtro !== "todos") conteoQuery = conteoQuery.eq("tabla", filtro);
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
    if (filtro !== "todos") consulta = consulta.eq("tabla", filtro);
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

  const hrefPagina = (valor: string, numeroPagina = 1) => {
    const params = new URLSearchParams();
    if (valor !== "todos") params.set("tabla", valor);
    if (numeroPagina > 1) params.set("pagina", String(numeroPagina));
    const cadena = params.toString();
    return cadena ? `/admin/auditoria?${cadena}` : "/admin/auditoria";
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Auditoría</h1>
        <p className="mt-1 text-sm text-slate-500">
          Bitácora de quién hizo qué y cuándo: cancelaciones y reversiones, papelera y
          restauraciones, eliminaciones definitivas, envíos a producción y cambios de estado de
          revisión. Se registra automáticamente y no se puede editar ni borrar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {FILTROS.map(([valor, etiqueta]) => (
          <Link
            key={valor}
            href={hrefPagina(valor)}
            className={`rounded-full border px-3 py-1 font-medium transition-colors ${
              filtro === valor
                ? "border-slate-900 bg-slate-900 text-white"
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

      {!error && filas.length === 0 && (
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
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 font-medium ${TONOS[tono]}`}
                      >
                        {etiqueta}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {f.tabla === "pedidos" ? (
                        <>Pedido {d.numero_pedido ?? "—"}</>
                      ) : (
                        <>
                          Ítem {d.item_code ?? "—"}
                          {d.modelo ? ` — ${d.modelo}` : ""}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{d.motivo ?? "—"}</td>
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
