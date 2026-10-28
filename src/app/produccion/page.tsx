import Link from "next/link";
import Bienvenida from "@/components/bienvenida";
import { createClient } from "@/lib/supabase/server";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { resumirTaller } from "@/lib/produccion/atrasos";
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

// Filas por sección: lo demás está a un clic en su pantalla.
const MAX_FILAS = 8;
// O.T. con pendientes a la vista (las más recientes); las demás se despliegan.
const OTS_A_LA_VISTA = 5;

// Inicio de Producción: los modelos que comparten varias O.T./PM, qué
// tiene cada equipo y qué O.T. tienen pendientes. Cada bloque lleva a su pantalla.
export default async function ProduccionInicioPage() {
  const supabase = await createClient();
  const hoy = hoyMexico();
  const [muebles, { asignaciones, plazos }] = await Promise.all([
    cargarMueblesInicio(supabase),
    cargarTaller(supabase, hoy),
  ]);

  const conteos = contarInicio(muebles);
  const taller = resumirTaller(asignaciones, plazos, hoy);
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
          detalle="Asignaciones que cada equipo tiene ahora."
          vacio="No hay nada en taller ahora."
          total={taller.equipos.length}
          verTodo={{ href: "/produccion/taller", etiqueta: "Taller" }}
        >
          {taller.equipos.slice(0, MAX_FILAS).map((e) => (
            <li key={e.equipoId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-900">{e.equipo}</span>
                <span className="text-xs text-slate-500">
                  {e.pedidos} PM · la más antigua lleva {e.masAntigua} d
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {e.atrasadas > 0 && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    {e.atrasadas} atrasadas
                  </span>
                )}
                <span className="text-lg font-semibold tabular-nums text-slate-900">{e.filas.length}</span>
              </span>
            </li>
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
        href={/^d+-d{2}$/.test(o.ot) ? `/produccion/ot/${o.ot}` : `/produccion/pedidos/${o.pedidoId}`}
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

function Seccion({
  titulo,
  detalle,
  vacio,
  total,
  verTodo,
  children,
}: {
  titulo: string;
  detalle: string;
  vacio: string;
  total: number;
  verTodo: { href: string; etiqueta: string };
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
