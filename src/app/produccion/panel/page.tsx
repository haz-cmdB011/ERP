import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getPerfilActual,
  puedeAdministrarProduccion,
  puedeEditarProduccion,
} from "@/lib/auth/get-perfil";
import { leer } from "@/lib/supabase/leer";
import { getImagenesConGrandePorItem } from "@/lib/planeacion/imagenes";
import type { EncargadoEquipo, EquipoProduccion } from "@/lib/produccion/asignaciones";
import { entregasPorAsignacion } from "@/lib/produccion/consultar-asignaciones";
import {
  agruparPanel,
  conteosPanel,
  FILTROS_PANEL,
  filtrarPanel,
  leerFiltroPanel,
  MAX_IDS_PANEL,
  pasaFiltro,
  type FiltroPanel,
} from "@/lib/produccion/panel";
import { cargarMueblesDePanel } from "@/lib/produccion/panel-db";
import DetalleAsignacion from "@/app/produccion/asignaciones/detalle-asignacion";
import BuscadorPanel from "./buscador-panel";
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
  // Por omisión, lo activo (por asignar y en proceso), también al llegar de liberar.
  const filtro = leerFiltroPanel(uno(params.estado), false);
  const filtroPorOmision = "activos";
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

  // Entregas y acciones de las asignaciones que se ven (no de todo el historial) y la miniatura
  // de cada mueble (la primera imagen guardada; sin ella la fila queda con un cuadro vacío).
  const asignaciones = visibles.flatMap((m) => m.flujo.asignaciones);
  const [entregas, imagenesPorItem] = await Promise.all([
    entregasPorAsignacion(
      supabase,
      asignaciones.map((a) => a.id)
    ),
    getImagenesConGrandePorItem(
      supabase,
      visibles.map((m) => m.flujo.id)
    ),
  ]);
  const imagenes = Object.fromEntries(
    visibles.flatMap((m) => {
      const imagen = imagenesPorItem.get(m.flujo.id)?.[0];
      return imagen ? [[m.flujo.id, imagen]] : [];
    })
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
  const hayFiltros = !!ot || !!q;
  // Lo que conserva el buscador al cambiar ?q=.
  const otrosFiltros = new URLSearchParams(href({ q: "" }).split("?")[1] ?? "").toString();
  // "Todos" no se ofrece: es la suma de Activos y Terminados.
  const segmentos = FILTROS_PANEL.filter((f) => f.valor !== "todos");

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-2.5 pb-24 sm:gap-5 sm:p-6 sm:pb-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Panel de asignación</h1>
        {(enfoque || ot) && (
          <Link href="/produccion/panel" className="text-sm font-medium text-sky-700 hover:underline">
            {enfoque ? "Ver todos los liberados" : `Quitar O.T. ${ot}`}
          </Link>
        )}
      </div>


      <div className="flex flex-wrap items-center gap-3">
        <nav
          aria-label="Filtrar por estado"
          className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm"
        >
          {segmentos.map((f) => (
            <Link
              key={f.valor}
              href={href({ estado: f.valor })}
              aria-current={filtro === f.valor ? "true" : undefined}
              className={`rounded-md px-3 py-1.5 whitespace-nowrap transition-colors ${
                filtro === f.valor
                  ? "bg-slate-900 font-medium text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.etiqueta} <span className="tabular-nums opacity-60">{conteos[f.valor]}</span>
            </Link>
          ))}
        </nav>
        <BuscadorPanel inicial={q} otros={otrosFiltros} />
      </div>

      {liberados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          <p>Todavía no hay muebles liberados a producción.</p>
          <Link href="/produccion/pedidos" className="font-medium text-brand-700 hover:underline">
            Elegir un pedido →
          </Link>
        </div>
      ) : visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
          {q ? `Nada coincide con "${q}".` : "No hay muebles en este estado."}{" "}
          {hayFiltros && (
            <Link href={href({ ot: null, q: "" })} className="font-medium text-sky-700 hover:underline">
              Quitar la búsqueda
            </Link>
          )}
        </p>
      ) : (
        <PanelAsignacion
          grupos={grupos}
          equipos={equipos ?? []}
          encargados={encargados ?? []}
          puedeEditar={puedeEditar}
          detalles={detalles}
          imagenes={imagenes}
        />
      )}
    </main>
  );
}
