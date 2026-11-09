import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { getImagenesConGrandePorItem } from "@/lib/planeacion/imagenes";
import { hoyMexico, type EquipoProduccion } from "@/lib/produccion/asignaciones";
import { armarBitacora, repartirBitacora, sinAsignarPorModelo } from "@/lib/produccion/bitacora";
import { renglonesDeTablero } from "@/lib/produccion/control-taller";
import { tarjetasDeControl, type TarjetaTablero } from "@/lib/produccion/tablero";
import { cargarBitacora, cargarMarcasDeMuebles } from "@/lib/produccion/bitacora-db";
import {
  ESTADOS_INICIO,
  MAX_MODELOS_RECIENTES,
  contarInicio,
  modelosRecientes,
  otsConPendientes,
  type OtPendiente,
} from "@/lib/produccion/inicio";
import { cargarMueblesInicio } from "@/lib/produccion/inicio-db";
import AnilloEstados, { MuestraAnillo } from "./anillo-estados";
import BitacoraTaller from "./bitacora-taller";
import CambiarVista from "./cambiar-vista";
import ListaModelos from "./lista-modelos";
import TableroMarcas from "./tablero-marcas";

// O.T. con pendientes a la vista (las más recientes); las demás se despliegan.
const OTS_A_LA_VISTA = 4;

// Inicio de Producción, como bitácora: los muebles más recientes por modelo, cada uno con quién lo
// tiene (equipo, cuántos, en qué O.T./PM y si sigue en su taller) y, al final, qué O.T. tienen
// pendientes. Cada bloque lleva a su pantalla.
export default async function ProduccionInicioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // El tablero es la vista por omisión; la lista queda a un clic (`?vista=lista`).
  const vista = (Array.isArray(params.vista) ? params.vista[0] : params.vista) === "lista" ? "lista" : "tablero";
  const supabase = await createClient();
  const hoy = hoyMexico();
  const [muebles, { asignaciones, plazos, ots: otsDePm, marcas }, { data: equiposActivos }, perfil] = await Promise.all([
    cargarMueblesInicio(supabase),
    cargarBitacora(supabase, hoy),
    supabase
      .from("equipos_produccion")
      .select("id, nombre, es_planta")
      .eq("activo", true)
      .order("es_planta", { ascending: false })
      .order("nombre")
      .returns<Pick<EquipoProduccion, "id" | "nombre" | "es_planta">[]>(),
    getPerfilActual(supabase),
  ]);
  const puedeEditar = puedeEditarProduccion(perfil);

  const marcasDeMuebles = await cargarMarcasDeMuebles(supabase, muebles.map((m) => m.id));
  const conteos = contarInicio(muebles);
  const bitacora = armarBitacora(asignaciones, plazos, otsDePm, hoy, marcas);
  // "Sin trabajo": los equipos que ni siquiera salen en la bitácora (nada en taller ni entregado hace poco).
  const conFilas = new Set(bitacora.map((g) => g.equipoId));
  const libres = (equiposActivos ?? []).filter((e) => !conFilas.has(e.id));
  const modelos = modelosRecientes(muebles).slice(0, MAX_MODELOS_RECIENTES);
  const ots = otsConPendientes(muebles);
  // Quién tiene cada modelo va dentro de su recuadro; lo que no coincide con ninguno queda en la bitácora.
  const { porModelo, resto } = repartirBitacora(bitacora, modelos.map((m) => m.modelo));
  // Los muebles sin ninguna asignación también llevan su palomita o su tache.
  const sinAsignar = sinAsignarPorModelo(muebles, porModelo, modelos.map((m) => m.modelo), marcasDeMuebles);

  // Tablero: una tarjeta por mueble o asignación, con la miniatura del mueble y cuándo fue lo último
  // (las imágenes solo se piden si se ve el tablero).
  let tarjetas: TarjetaTablero[] = [];
  if (vista === "tablero") {
    const renglones = renglonesDeTablero(muebles, bitacora, marcasDeMuebles);
    const imagenesPorItem = await getImagenesConGrandePorItem(
      supabase,
      [...new Set(renglones.flatMap((r) => (r.planeacionItemId ? [r.planeacionItemId] : [])))]
    );
    const imagenes = Object.fromEntries(
      [...imagenesPorItem].flatMap(([id, lista]) => (lista[0] ? [[id, lista[0]]] : []))
    );
    // Los mismos anillos de la lista: cuántos muebles de cada modelo hay en cada estado.
    const conteosPorModelo = new Map(modelosRecientes(muebles).map((m) => [m.modelo, m.conteos]));
    tarjetas = tarjetasDeControl(renglones, { imagenes, conteosPorModelo });
  }

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

      {/* Una sola tarjeta: los muebles recientes arriba y la bitácora de taller debajo. */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        {vista === "tablero" ? (
          <TableroMarcas
            tarjetas={tarjetas}
            puedeEditar={puedeEditar}
            acciones={<CambiarVista vista={vista} />}
          />
        ) : (
          <>
            <ListaModelos
              modelos={modelos}
              asignaciones={porModelo}
              sinAsignar={sinAsignar}
              puedeEditar={puedeEditar}
              acciones={<CambiarVista vista={vista} />}
            />
            <BitacoraTaller grupos={resto} libres={libres} puedeEditar={puedeEditar} embebido />
          </>
        )}
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
