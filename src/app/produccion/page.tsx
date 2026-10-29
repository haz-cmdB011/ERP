import Link from "next/link";
import Bienvenida from "@/components/bienvenida";
import { createClient } from "@/lib/supabase/server";
import { PROCESO_LABELS, hoyMexico, type EquipoProduccion } from "@/lib/produccion/asignaciones";
import { esAlerta, resumirTaller, type ResumenEquipo } from "@/lib/produccion/atrasos";
import { cargarTaller } from "@/lib/produccion/cargar-taller";
import {
  ESTADOS_INICIO,
  contarInicio,
  modelosCompartidos,
  otsConPendientes,
  type OtPendiente,
} from "@/lib/produccion/inicio";
import { cargarMueblesInicio } from "@/lib/produccion/inicio-db";
import AnilloEstados, { COLOR_ESTADO } from "./anillo-estados";
import CarruselModelos from "./carrusel-modelos";
import ChipPlazo from "./chip-plazo";

// Filas por sección: lo demás está a un clic en su pantalla.
const MAX_FILAS = 8;
// Asignaciones a la vista por equipo (las más atrasadas); el resto, en el taller.
const ASIGNACIONES_POR_EQUIPO = 3;
// O.T. con pendientes a la vista (las más recientes); las demás se despliegan.
const OTS_A_LA_VISTA = 5;

// Inicio de Producción: los modelos que comparten varias O.T./PM, qué
// tiene cada equipo y qué O.T. tienen pendientes. Cada bloque lleva a su pantalla.
export default async function ProduccionInicioPage() {
  const supabase = await createClient();
  const hoy = hoyMexico();
  const [muebles, { asignaciones, plazos }, { data: equiposActivos }] = await Promise.all([
    cargarMueblesInicio(supabase),
    cargarTaller(supabase, hoy),
    supabase
      .from("equipos_produccion")
      .select("id, nombre, es_planta")
      .eq("activo", true)
      .order("es_planta", { ascending: false })
      .order("nombre")
      .returns<Pick<EquipoProduccion, "id" | "nombre" | "es_planta">[]>(),
  ]);

  const conteos = contarInicio(muebles);
  const taller = resumirTaller(asignaciones, plazos, hoy);
  const ocupados = new Set(taller.equipos.map((e) => e.equipoId));
  const libres = (equiposActivos ?? []).filter((e) => !ocupados.has(e.id));
  const modelos = modelosCompartidos(muebles);
  const ots = otsConPendientes(muebles);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida />
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Producción</h1>
          <p className="mt-1 text-sm text-slate-500">
            {muebles.length} muebles vigentes · {conteos.terminado} terminado{conteos.terminado === 1 ? "" : "s"}
          </p>
        </div>
        <Leyenda />
      </div>

      <CarruselModelos modelos={modelos} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Seccion
          titulo="En taller por equipo"
          detalle="Lo que tiene cada equipo, lo atrasado primero."
          vacio="No hay nada en taller ahora."
          total={taller.equipos.length}
          verTodo={{ href: "/produccion/taller", etiqueta: "Taller" }}
          pie={
            libres.length > 0 && (
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Sin trabajo:</span>{" "}
                {libres.map((e) => e.nombre + (e.es_planta ? " (planta)" : "")).join(", ")}
              </p>
            )
          }
        >
          {taller.equipos.slice(0, MAX_FILAS).map((e) => (
            <EquipoEnTaller key={e.equipoId} e={e} />
          ))}
        </Seccion>

      <Seccion
        titulo="O.T. con pendientes"
        detalle="Lo que falta liberar, asignar o sigue en el taller."
        vacio="Ninguna O.T. tiene pendientes."
        total={ots.length}
        verTodo={{ href: "/produccion/pedidos", etiqueta: "Pedidos" }}
      >
        {ots.slice(0, OTS_A_LA_VISTA).map((o) => (
          <FilaOt key={o.ot} o={o} />
        ))}
        {/* Las demás, plegadas: se abren con el botón y se vuelven a cerrar. */}
        {ots.length > OTS_A_LA_VISTA && (
          <li>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Ver más</span>
                <span className="hidden group-open:inline">Ver menos</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {ots.slice(OTS_A_LA_VISTA).map((o) => (
                  <FilaOt key={o.ot} o={o} />
                ))}
              </ul>
            </details>
          </li>
        )}
      </Seccion>
      </div>
    </main>
  );
}

function FilaOt({ o }: { o: OtPendiente }) {
  return (
    <li>
      <Link
        href={/^\d+-\d{2}$/.test(o.ot) ? `/produccion/ot/${o.ot}` : `/produccion/pedidos/${o.pedidoId}`}
        className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate-50"
      >
        <AnilloEstados conteos={o.conteos} />
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-slate-900">O.T. {o.ot}</span>
          <span className="ml-2 text-xs text-slate-500">{o.pms} PM</span>
        </span>
        <span className="flex flex-wrap justify-end gap-x-3 text-xs text-slate-600 tabular-nums">
          {ESTADOS_INICIO.filter((e) => e.valor !== "terminado" && o.conteos[e.valor] > 0).map((e) => (
            <span key={e.valor}>
              {o.conteos[e.valor]} {e.etiqueta.toLowerCase()}
            </span>
          ))}
        </span>
      </Link>
    </li>
  );
}

// Un equipo con sus asignaciones en taller: las más atrasadas a la vista, cada una con su
// avance (entregado de lo asignado) y su plazo; tocarla abre las asignaciones del PM.
function EquipoEnTaller({ e }: { e: ResumenEquipo }) {
  const hrefEquipo = `/produccion/taller?vista=lista&equipo=${e.equipoId}`;
  const visibles = e.filas.slice(0, ASIGNACIONES_POR_EQUIPO);
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={hrefEquipo} className="min-w-0 truncate font-semibold text-slate-900 hover:text-brand-700 hover:underline">
          {e.equipo}
        </Link>
        <span className="shrink-0 text-xs text-slate-500 tabular-nums">
          {e.atrasadas > 0 && <span className="mr-2 font-semibold text-rose-700">{e.atrasadas} atrasada{e.atrasadas === 1 ? "" : "s"}</span>}
          {e.filas.length} asignaci{e.filas.length === 1 ? "ón" : "ones"}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {visibles.map((f) => {
          const cantidad = Number(f.cantidad);
          const avance = cantidad > 0 ? Math.min(1, Number(f.entregado) / cantidad) : 0;
          const contenido = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800">{f.modelo ?? `Ítem ${f.item_code}`}</span>
                <span className="block truncate text-xs text-slate-500">
                  {f.numero_pedido} · {PROCESO_LABELS[f.proceso]} · {f.diasEnTaller} d en taller
                </span>
              </span>
              <span className="flex w-24 shrink-0 flex-col items-end gap-1">
                <span className="text-xs tabular-nums text-slate-600">
                  {Number(f.entregado)}/{cantidad} {f.unidad ?? ""}
                </span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <span className="block h-full rounded-full bg-brand-600" style={{ width: `${avance * 100}%` }} />
                </span>
              </span>
              {esAlerta(f.plazo) && (
                <span className="shrink-0">
                  <ChipPlazo plazo={f.plazo} />
                </span>
              )}
            </>
          );
          const clase = "-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5";
          return (
            <li key={f.id}>
              {f.pedido_id ? (
                <Link href={`/produccion/pedidos/${f.pedido_id}/asignaciones`} className={`${clase} transition-colors hover:bg-slate-50`}>
                  {contenido}
                </Link>
              ) : (
                <div className={clase}>{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>
      {e.filas.length > visibles.length && (
        <Link href={hrefEquipo} className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline">
          Ver las {e.filas.length}
        </Link>
      )}
    </li>
  );
}

function Seccion({
  titulo,
  detalle,
  vacio,
  total,
  verTodo,
  pie,
  children,
}: {
  titulo: string;
  detalle: string;
  vacio: string;
  total: number;
  verTodo: { href: string; etiqueta: string };
  pie?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {titulo}
            {total > 0 && <span className="ml-1.5 font-normal text-slate-500">({total})</span>}
          </h2>
          <p className="text-xs text-slate-500">{detalle}</p>
        </div>
        <Link href={verTodo.href} className="shrink-0 text-xs font-medium text-brand-700 hover:underline">
          {verTodo.etiqueta} →
        </Link>
      </header>
      {total === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">{vacio}</p>
      ) : (
        <ul className="divide-y divide-slate-100">{children}</ul>
      )}
      {pie}
    </section>
  );
}

function Leyenda() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Colores de los anillos">
      {ESTADOS_INICIO.map((e) => (
        <li key={e.valor} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR_ESTADO[e.valor] }} aria-hidden="true" />
          {e.etiqueta}
        </li>
      ))}
    </ul>
  );
}
