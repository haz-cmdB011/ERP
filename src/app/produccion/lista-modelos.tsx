import Link from "next/link";
import { pmCorto } from "@/lib/planeacion/pm-corto";
import { etiquetaProceso } from "@/lib/produccion/asignaciones";
import { esAlerta } from "@/lib/produccion/atrasos";
import { hrefAsignarDeFila, type FilaBitacora, type FilaSinAsignar } from "@/lib/produccion/bitacora";
import { MOTIVOS_ACTIVOS } from "@/lib/produccion/historial-marcas";
import { horaMexico } from "@/lib/produccion/dias";
import { ETIQUETA_ACTIVIDAD, type ModeloReciente } from "@/lib/produccion/inicio";
import { AnillosConcentricos } from "./anillo-estados";
import ChipPlazo from "./chip-plazo";
import MarcaSeleccionable from "./marca-seleccionable";

// Modelos a la vista antes de "Ver más" y tope de renglones por modelo (cada mueble y cada asignación).
const MODELOS_A_LA_VISTA = 8;
const FILAS_POR_MODELO = 8;

const ESTADO_MUEBLE: Record<FilaSinAsignar["estado"], string> = {
  por_liberar: "Por liberar",
  por_asignar: "Por asignar",
  en_proceso: "En proceso",
  terminado: "Terminado",
};

// Columnas en pantallas anchas: mueble (anillos, nombre y O.T.), equipo, cuántos tiene, O.T./PM,
// está y asignar. La cabecera y cada fila usan las mismas para que todo quede alineado.
const COLUMNAS = MOTIVOS_ACTIVOS
  ? "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_6.5rem_5rem]"
  : "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_4.5rem_5rem]";

const esOt = (ot: string | null): ot is string => !!ot && /^\d+-\d{2}$/.test(ot);

// Bitácora de producción: los muebles recientes y quién los tiene, en una sola lista vertical, lo más
// reciente primero. Un renglón por modelo con la hora y de qué fue su
// último movimiento (PM subido, liberado, asignado, entrega), sus anillos de estado, su nombre (abre el panel), sus O.T. y, al lado, el equipo que lo tiene,
// cuántos, en qué O.T./PM, la palomita o el tache que elige quien asigna (Producción) y el botón que
// lleva al panel de asignación. Cada mueble lleva su marca, tenga o no equipo.
export default function ListaModelos({
  modelos,
  asignaciones,
  sinAsignar,
  puedeEditar,
  acciones,
}: {
  modelos: ModeloReciente[];
  // Quién tiene cada modelo, por su clave (mayúsculas, espacios simples).
  asignaciones: Record<string, FilaBitacora[]>;
  // Los muebles de cada modelo que no tienen ninguna asignación, por su clave.
  sinAsignar: Record<string, FilaSinAsignar[]>;
  // Quien trabaja en Producción puede elegir la palomita o el tache.
  puedeEditar: boolean;
  // Lo que va a la derecha del encabezado (el interruptor Tablero / Lista).
  acciones?: React.ReactNode;
}) {
  const filaDe = (m: ModeloReciente) => (
    <FilaModelo key={m.modelo} m={m} filas={asignaciones[m.modelo] ?? []} sinAsignar={sinAsignar[m.modelo] ?? []} puedeEditar={puedeEditar} />
  );
  // Los primeros modelos a la vista y los demás plegados.
  const aLaVista = modelos.slice(0, MODELOS_A_LA_VISTA);
  const plegados = modelos.slice(MODELOS_A_LA_VISTA);
  return (
    <section aria-label="Bitácora de producción" className="flex min-w-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">
          Bitácora de producción
          {modelos.length > 0 && <span className="ml-1.5 font-normal text-slate-500">({modelos.length})</span>}
        </h2>
        {acciones}
      </header>

      {modelos.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">Todavía no hay muebles en producción.</p>
      ) : (
        <>
          <div className={`hidden gap-x-3 border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400 sm:grid ${COLUMNAS}`}>
            <span>Mueble</span>
            <span>Equipo</span>
            <span>Piezas</span>
            <span>O.T. · PM</span>
            <span className="text-center">Está</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100">{aLaVista.map(filaDe)}</ul>
          {/* Los demás, plegados: se abren con el botón y se vuelven a cerrar. */}
          {modelos.length > MODELOS_A_LA_VISTA && (
            <details className="group border-t border-slate-100">
              <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Ver más ({modelos.length - MODELOS_A_LA_VISTA})</span>
                <span className="hidden group-open:inline">Ver menos</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">{plegados.map(filaDe)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function FilaModelo({
  m,
  filas,
  sinAsignar,
  puedeEditar,
}: {
  m: ModeloReciente;
  filas: FilaBitacora[];
  sinAsignar: FilaSinAsignar[];
  puedeEditar: boolean;
}) {
  // Primero las asignaciones y luego los muebles que aún no tienen ninguna; todos llevan su marca.
  const visibles = filas.slice(0, FILAS_POR_MODELO);
  const visiblesSin = sinAsignar.slice(0, Math.max(0, FILAS_POR_MODELO - visibles.length));
  const ocultos = filas.length + sinAsignar.length - visibles.length - visiblesSin.length;
  const renglones = Math.max(1, visibles.length + visiblesSin.length + (ocultos > 0 ? 1 : 0));
  return (
    <li className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 px-4 py-3 ${COLUMNAS}`}>
      {/* Mueble: sus anillos de estado, su nombre y sus O.T. */}
      <div
        className="flex min-w-0 items-center gap-3 sm:[grid-row:span_var(--r)]"
        style={{ "--r": renglones } as React.CSSProperties}
      >
        <span className="shrink-0">
          <AnillosConcentricos conteos={m.conteos} tamano="size-20" />
        </span>
        <div className="min-w-0">
          <Link
            href={`/produccion/panel?estado=todos&q=${encodeURIComponent(m.modelo)}`}
            className="block break-words text-lg font-bold leading-tight tracking-tight text-slate-900 hover:underline"
            title={`Ver ${m.modelo} en el panel de asignación`}
          >
            {m.modelo}
          </Link>
          {m.reciente && (
            <p className="mt-0.5 text-xs tabular-nums text-slate-500">
              {horaMexico(m.reciente)} · {ETIQUETA_ACTIVIDAD[m.tipoReciente]}
            </p>
          )}
          <ul aria-label={`O.T. con ${m.modelo}`} className="mt-1.5 flex flex-wrap gap-1.5">
            {m.pms.map((p) => (
              <li key={p.pedidoId}>
                <Link
                  href={esOt(p.ot) ? `/produccion/ot/${p.ot}` : `/produccion/pedidos/${p.pedidoId}`}
                  title={p.numeroPm}
                  className="block rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-medium tabular-nums text-slate-700 transition-colors hover:border-brand-400 hover:text-slate-900"
                >
                  {p.ot ?? pmCorto(p.numeroPm)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {visibles.map((f) => (
        <AsignacionDeModelo key={f.id} f={f} puedeEditar={puedeEditar} />
      ))}
      {visiblesSin.map((f) => (
        <MuebleSinAsignar key={f.itemId} f={f} modelo={m.modelo} puedeEditar={puedeEditar} />
      ))}
      {ocultos > 0 && (
        <p className="text-xs sm:col-span-5">
          <Link
            href={`/produccion/panel?estado=todos&q=${encodeURIComponent(m.modelo)}`}
            className="font-medium text-brand-700 hover:underline"
          >
            y {ocultos} más →
          </Link>
        </p>
      )}
    </li>
  );
}

// Una asignación del modelo: en pantallas anchas ocupa las cinco columnas de la derecha (subcuadrícula)
// y cada celda cae en la suya; en el teléfono, juntas en una tarjeta.
function AsignacionDeModelo({ f, puedeEditar }: { f: FilaBitacora; puedeEditar: boolean }) {
  const unidad = (f.parte_id ? (f.parte_unidad ?? f.unidad) : f.unidad) ?? "";
  const ot = f.ot ? `O.T. ${f.ot}` : "Sin O.T.";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-slate-50/60 p-2 sm:col-span-5 sm:grid-cols-subgrid sm:gap-y-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
      <span className="min-w-0 sm:col-start-1 sm:row-start-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{f.equipo}</span>
        <span className="block truncate text-xs text-slate-500">
          {etiquetaProceso(f)}
          {f.encargado ? ` · ${f.encargado}` : ""}
        </span>
      </span>
      {/* Una sola marca: arriba a la derecha en el teléfono, en su columna en pantallas anchas. */}
      <span className="flex justify-end sm:col-start-4 sm:row-start-1 sm:justify-center">
        <MarcaSeleccionable
          asignacionId={f.id}
          inicial={f.marca}
          notaInicial={f.nota}
          puedeEditar={puedeEditar}
          titulo={`${f.modelo ?? `Ítem ${f.item_code}`} · ${f.equipo}`}
        />
      </span>

      <span className="col-span-2 text-xs tabular-nums text-slate-700 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-sm">
        <span className="text-slate-500 sm:hidden">Piezas: </span>
        <b className="font-semibold">{Number(f.cantidad)}</b> {unidad}
      </span>

      <span className="col-span-2 flex min-w-0 items-center gap-2 text-xs text-slate-600 sm:col-span-1 sm:col-start-3 sm:row-start-1">
        <span className="truncate" title={`${ot} · ${f.numero_pedido}`}>
          <span className="font-medium text-slate-800">{ot}</span> · {pmCorto(f.numero_pedido)}
        </span>
        {f.estaEnTaller && esAlerta(f.plazo) && <ChipPlazo plazo={f.plazo} />}
      </span>

      <Link
        href={hrefAsignarDeFila(f)}
        className="col-span-2 rounded-md border border-brand-600 px-3 py-1.5 text-center text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 sm:col-span-1 sm:col-start-5 sm:row-start-1"
      >
        Asignar
      </Link>
    </div>
  );
}

// Un mueble del modelo que todavía no tiene ninguna asignación (por liberar, por asignar o ya sin
// asignaciones a la vista): lleva su estado, su O.T./PM, su palomita o tache y su botón. Lo que sigue
// por liberar no está en el panel de asignación: su botón lleva al pedido, donde se libera.
function MuebleSinAsignar({ f, modelo, puedeEditar }: { f: FilaSinAsignar; modelo: string; puedeEditar: boolean }) {
  const ot = f.ot ? `O.T. ${f.ot}` : "Sin O.T.";
  const porLiberar = f.estado === "por_liberar";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-slate-50/60 p-2 sm:col-span-5 sm:grid-cols-subgrid sm:gap-y-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
      <span className="min-w-0 text-sm text-slate-500 sm:col-start-1 sm:row-start-1">
        Sin equipo · {ESTADO_MUEBLE[f.estado]}
      </span>
      <span className="flex justify-end sm:col-start-4 sm:row-start-1 sm:justify-center">
        <MarcaSeleccionable
          itemId={f.itemId}
          inicial={f.marca}
          notaInicial={f.nota}
          puedeEditar={puedeEditar}
          titulo={`${modelo} · sin equipo (${f.numeroPm})`}
        />
      </span>

      {/* Las piezas que pide el PM de este mueble. */}
      <span className="col-span-2 text-xs tabular-nums text-slate-700 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-sm">
        <span className="text-slate-500 sm:hidden">Piezas: </span>
        <b className="font-semibold">{f.cantidad}</b> {f.unidad ?? ""}
      </span>

      <span className="col-span-2 min-w-0 truncate text-xs text-slate-600 sm:col-span-1 sm:col-start-3 sm:row-start-1" title={`${ot} · ${f.numeroPm}`}>
        <span className="font-medium text-slate-800">{ot}</span> · {pmCorto(f.numeroPm)}
      </span>

      <Link
        href={porLiberar ? `/produccion/pedidos/${f.pedidoId}` : hrefAsignarDeFila({ numero_pedido: f.numeroPm, estaEnTaller: false })}
        title={porLiberar ? "Primero hay que liberarlo desde el pedido" : undefined}
        className="col-span-2 rounded-md border border-brand-600 px-3 py-1.5 text-center text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 sm:col-span-1 sm:col-start-5 sm:row-start-1"
      >
        {porLiberar ? "Liberar" : "Asignar"}
      </Link>
    </div>
  );
}
