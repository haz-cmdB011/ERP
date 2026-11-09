import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { getImagenesConGrandePorItem } from "@/lib/planeacion/imagenes";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { armarBitacora } from "@/lib/produccion/bitacora";
import { renglonesDeTablero } from "@/lib/produccion/control-taller";
import { tarjetasDeControl, type TarjetaTablero } from "@/lib/produccion/tablero";
import { cargarBitacora, cargarMarcasDeMuebles } from "@/lib/produccion/bitacora-db";
import {
  ESTADOS_INICIO,
  contarInicio,
  modelosRecientes,
  otsConPendientes,
  type OtPendiente,
} from "@/lib/produccion/inicio";
import { cargarMueblesInicio } from "@/lib/produccion/inicio-db";
import AnilloEstados, { MuestraAnillo } from "./anillo-estados";
import TableroMarcas from "./tablero-marcas";

// O.T. con pendientes a la vista (las más recientes); las demás se despliegan.
const OTS_A_LA_VISTA = 4;

// Inicio de Producción: el tablero de muebles por asignar y, al final, qué O.T. tienen pendientes.
// (La lista de modelos con la bitácora de taller se quitó por ahora: `lista-modelos.tsx`,
// `bitacora-taller.tsx` y `cambiar-vista.tsx` siguen en el repositorio por si se vuelve a poner.)
export default async function ProduccionInicioPage() {
  const supabase = await createClient();
  const hoy = hoyMexico();
  const [muebles, { asignaciones, plazos, ots: otsDePm, marcas }, perfil] = await Promise.all([
    cargarMueblesInicio(supabase),
    cargarBitacora(supabase, hoy),
    getPerfilActual(supabase),
  ]);
  const puedeEditar = puedeEditarProduccion(perfil);

  const marcasDeMuebles = await cargarMarcasDeMuebles(supabase, muebles.map((m) => m.id));
  const conteos = contarInicio(muebles);
  const bitacora = armarBitacora(asignaciones, plazos, otsDePm, hoy, marcas);
  const ots = otsConPendientes(muebles);

  // Tablero: una tarjeta por mueble o asignación, con la miniatura del mueble y cuándo fue lo último.
  const renglones = renglonesDeTablero(muebles, bitacora, marcasDeMuebles);
  const imagenesPorItem = await getImagenesConGrandePorItem(
    supabase,
    [...new Set(renglones.flatMap((r) => (r.planeacionItemId ? [r.planeacionItemId] : [])))]
  );
  const imagenes = Object.fromEntries(
    [...imagenesPorItem].flatMap(([id, lista]) => (lista[0] ? [[id, lista[0]]] : []))
  );
  // Los anillos de cada tarjeta: cuántos muebles de ese modelo hay en cada estado.
  const conteosPorModelo = new Map(modelosRecientes(muebles).map((m) => [m.modelo, m.conteos]));
  const tarjetas: TarjetaTablero[] = tarjetasDeControl(renglones, { imagenes, conteosPorModelo });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Producción</h1>
          <p className="mt-1 text-sm text-slate-500">
            {muebles.length} muebles vigentes · {conteos.terminado} terminado{conteos.terminado === 1 ? "" : "s"}
          </p>
        </div>
        <Leyenda />
      </div>

      <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <TableroMarcas tarjetas={tarjetas} puedeEditar={puedeEditar} />
      </div>

      <Seccion
        titulo="O.T. con pendientes"
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
              <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
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
    </main>
  );
}

function FilaOt({ o }: { o: OtPendiente }) {
  return (
    <li>
      <Link
        href={/^\d+-\d{2}$/.test(o.ot) ? `/produccion/ot/${o.ot}` : `/produccion/pedidos/${o.pedidoId}`}
        className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-brand-50"
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
  detalle?: string;
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
          {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
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
          <MuestraAnillo estado={e.valor} />
          {e.etiqueta}
        </li>
      ))}
    </ul>
  );
}
