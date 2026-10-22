import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getPerfilActual,
  puedeAdministrarProduccion,
  puedeEditarProduccion,
} from "@/lib/auth/get-perfil";
import { leer } from "@/lib/supabase/leer";
import type { EncargadoEquipo, EquipoProduccion } from "@/lib/produccion/asignaciones";
import { entregasPorAsignacion } from "@/lib/produccion/consultar-asignaciones";
import {
  agruparPanel,
  conteosPanel,
  FILTROS_PANEL,
  filtrarPanel,
  leerFiltroPanel,
  MAX_IDS_PANEL,
  otsDePanel,
  pasaFiltro,
  type FiltroPanel,
} from "@/lib/produccion/panel";
import { cargarMueblesDePanel } from "@/lib/produccion/panel-db";
import DetalleAsignacion from "@/app/produccion/asignaciones/detalle-asignacion";
import { estiloCampo } from "@/app/produccion/asignaciones/modal";
import PanelAsignacion from "./panel-asignacion";

export const metadata: Metadata = { title: "Panel de asignación" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_OT = /^\d+-\d{2}$/;

function uno(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

// Panel de asignación: los muebles liberados a producción de todos los PM y O.T., en el formato
// del flujo del PM (la ruta de cada mueble con el avance de cada paso), para ver cuáles siguen
// por asignar y cuáles ya están con un equipo, y asignarlos. Al liberar desde el carrito se
// llega aquí con `ids` (lo recién liberado); sin `ids`, son todos los liberados.
export default async function PanelAsignacionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ids = [
    ...new Set((uno(params.ids) ?? "").split(",").filter((id) => UUID.test(id))),
  ].slice(0, MAX_IDS_PANEL);
  const enfoque = ids.length > 0;
  const filtro = leerFiltroPanel(uno(params.estado), enfoque);
  const filtroPorOmision = enfoque ? "todos" : "activos";
  const otPedida = uno(params.ot) ?? "";
  const ot = FORMATO_OT.test(otPedida) ? otPedida : null;
  const q = (uno(params.q) ?? "").trim().slice(0, 100);

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const puedeEditar = puedeEditarProduccion(perfil);
  const puedeAnular = puedeAdministrarProduccion(perfil);

  const [liberados, equipos, encargados] = await Promise.all([
    cargarMueblesDePanel(supabase, enfoque ? ids : null),
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

  // Los contadores de cada filtro respetan la búsqueda y la O.T., no el estado elegido.
  const delBuscador = filtrarPanel(liberados, { filtro: "todos", ot, q });
  const conteos = conteosPanel(delBuscador);
  const visibles = delBuscador.filter((m) => pasaFiltro(m.estado, filtro));
  const grupos = agruparPanel(visibles);

  // Entregas y acciones de las asignaciones que se ven (no de todo el historial).
  const asignaciones = visibles.flatMap((m) => m.flujo.asignaciones);
  const entregas = await entregasPorAsignacion(
    supabase,
    asignaciones.map((a) => a.id)
  );
  const detalles = Object.fromEntries(
    asignaciones.map((a) => [
      a.id,
      <DetalleAsignacion
        key={a.id}
        asignacion={a}
        entregas={entregas.get(a.id) ?? []}
        puedeEditar={puedeEditar}
        puedeAnular={puedeAnular}
      />,
    ])
  );

  // Dirección del panel con otros filtros, conservando lo demás.
  const href = (cambios: { estado?: FiltroPanel; ot?: string | null; q?: string }) => {
    const estado = cambios.estado ?? filtro;
    const otNueva = cambios.ot === undefined ? ot : cambios.ot;
    const qNueva = cambios.q === undefined ? q : cambios.q;
    const p = new URLSearchParams();
    if (estado !== filtroPorOmision) p.set("estado", estado);
    if (otNueva) p.set("ot", otNueva);
    if (qNueva) p.set("q", qNueva);
    if (enfoque) p.set("ids", ids.join(","));
    const texto = p.toString();
    return texto ? `/produccion/panel?${texto}` : "/produccion/panel";
  };
  const ots = otsDePanel(liberados);
  const hayFiltros = !!ot || !!q;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 pb-24 sm:p-6 sm:pb-24">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Panel de asignación</h1>
        <p className="mt-1 text-sm text-slate-600">
          Los muebles liberados a producción, por O.T. y PM: cuáles siguen por asignar y cuáles ya
          están con un equipo. Cada mueble sigue su ruta; toca un paso con{" "}
          <span className="font-bold">+</span> para asignarlo.
        </p>
      </div>

      {enfoque && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-300 bg-brand-50 p-3 text-sm text-slate-800">
          <span>Estás viendo lo que acabas de liberar a producción.</span>
          <Link href="/produccion/panel" className="font-medium text-brand-700 underline">
            Ver todos los liberados
          </Link>
        </p>
      )}

      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2 text-sm">
        {FILTROS_PANEL.map((f) => (
          <Link
            key={f.valor}
            href={href({ estado: f.valor })}
            aria-current={filtro === f.valor ? "true" : undefined}
            className={`rounded-full border px-3 py-1.5 transition-colors ${
              filtro === f.valor
                ? "border-slate-900 bg-slate-900 font-medium text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.etiqueta} <span className="opacity-70">{conteos[f.valor]}</span>
          </Link>
        ))}
      </nav>

      <form method="get" action="/produccion/panel" className="flex flex-wrap items-end gap-2 text-sm">
        {filtro !== filtroPorOmision && <input type="hidden" name="estado" value={filtro} />}
        {enfoque && <input type="hidden" name="ids" value={ids.join(",")} />}
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Buscar
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="PM, modelo, descripción o proyecto"
            className={estiloCampo}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          O.T.
          <select name="ot" defaultValue={ot ?? ""} className={estiloCampo}>
            <option value="">Todas</option>
            {ots.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
        >
          Filtrar
        </button>
        {hayFiltros && (
          <Link href={href({ ot: null, q: "" })} className="px-1 py-2 text-slate-500 underline hover:text-slate-700">
            Limpiar
          </Link>
        )}
      </form>

      {liberados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          <p>Todavía no hay muebles liberados a producción.</p>
          <Link href="/produccion" className="font-medium text-brand-700 hover:underline">
            Elegir un pedido →
          </Link>
        </div>
      ) : visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
          No hay muebles con estos filtros.
          {filtro !== "todos" && (
            <>
              {" "}
              <Link href={href({ estado: "todos" })} className="font-medium text-brand-700 hover:underline">
                Ver todos
              </Link>
            </>
          )}
        </p>
      ) : (
        <PanelAsignacion
          grupos={grupos}
          equipos={equipos ?? []}
          encargados={encargados ?? []}
          puedeEditar={puedeEditar}
          detalles={detalles}
        />
      )}
    </main>
  );
}
