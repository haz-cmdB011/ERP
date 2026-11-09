import Link from "next/link";
import { pmCorto } from "@/lib/planeacion/pm-corto";
import { etiquetaProceso } from "@/lib/produccion/asignaciones";
import { esAlerta } from "@/lib/produccion/atrasos";
import { FILAS_POR_EQUIPO, hrefAsignarDeFila, type FilaBitacora, type GrupoBitacora } from "@/lib/produccion/bitacora";
import ChipPlazo from "./chip-plazo";
import { MOTIVOS_ACTIVOS } from "@/lib/produccion/historial-marcas";
import MarcaSeleccionable from "./marca-seleccionable";

// Columnas de cada fila en pantallas anchas: mueble, cuántos tiene, O.T./PM, está, asignar.
const COLUMNAS = MOTIVOS_ACTIVOS
  ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_6.5rem_auto]"
  : "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_4.5rem_auto]";

// Bitácora de taller: por equipo, qué muebles tiene, cuántos, en qué O.T./PM, la palomita o el
// tache que elige Producción (si está o no está en el taller) y un botón que lleva al panel de asignación.
export default function BitacoraTaller({
  grupos,
  libres,
  puedeEditar,
  embebido = false,
}: {
  grupos: GrupoBitacora[];
  // Equipos activos que no tienen nada en taller.
  libres: { nombre: string; es_planta: boolean }[];
  // Quien trabaja en Producción puede elegir la palomita o el tache.
  puedeEditar: boolean;
  // Sin marco propio y con una línea arriba, para ir dentro de la tarjeta que comparte con "Muebles recientes".
  embebido?: boolean;
}) {
  const enTaller = grupos.reduce((n, g) => n + g.enTaller, 0);
  // Embebida en la tarjeta de "Muebles recientes", lo de cada modelo ya está dentro de su recuadro:
  // aquí solo queda lo que no coincide con ninguno, la leyenda y los equipos sin trabajo.
  if (embebido && grupos.length === 0) {
    if (libres.length === 0) return null;
    return (
      <p className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
        <span className="font-medium text-slate-700">Sin trabajo:</span>{" "}
        {libres.map((e) => e.nombre + (e.es_planta ? " (planta)" : "")).join(", ")}
      </p>
    );
  }
  return (
    <section className={embebido ? "flex min-w-0 flex-col border-t border-slate-200" : "flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"}>
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {embebido ? "Otros muebles en taller, por equipo" : "Bitácora de taller por equipo"}
            {enTaller > 0 && <span className="ml-1.5 font-normal text-slate-500">({enTaller} en taller)</span>}
          </h2>
        </div>
      </header>

      {grupos.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">No hay nada en taller ahora.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {grupos.map((g) => (
            <EquipoBitacora key={g.equipoId} g={g} puedeEditar={puedeEditar} />
          ))}
        </ul>
      )}

      {libres.length > 0 && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Sin trabajo:</span>{" "}
          {libres.map((e) => e.nombre + (e.es_planta ? " (planta)" : "")).join(", ")}
        </p>
      )}
    </section>
  );
}

function EquipoBitacora({ g, puedeEditar }: { g: GrupoBitacora; puedeEditar: boolean }) {
  const visibles = g.filas.slice(0, FILAS_POR_EQUIPO);
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className="font-semibold text-slate-900">{g.equipo}</span>
          {g.encargado && <span className="ml-2 text-xs text-slate-500">Encargado: {g.encargado}</span>}
        </span>
        <span className="shrink-0 text-xs text-slate-500 tabular-nums">
          {g.atrasadas > 0 && (
            <span className="mr-2 font-semibold text-rose-700">
              {g.atrasadas} atrasada{g.atrasadas === 1 ? "" : "s"}
            </span>
          )}
          {g.enTaller} en taller
        </span>
      </div>

      <div className={`mt-2 hidden gap-3 px-2 text-xs font-medium uppercase tracking-wide text-slate-400 sm:grid ${COLUMNAS}`}>
        <span>Mueble</span>
        <span>Piezas</span>
        <span>O.T. · PM</span>
        <span className="text-center">Está</span>
        <span className="w-20" />
      </div>
      <ul className="mt-1 flex flex-col gap-1">
        {visibles.map((f) => (
          <FilaEquipo key={f.id} f={f} puedeEditar={puedeEditar} />
        ))}
      </ul>
      {g.filas.length > visibles.length && (
        <p className="mt-1 text-xs">
          <Link
            href={`/produccion/asignaciones?equipo=${g.equipoId}&estado=todas`}
            className="font-medium text-brand-700 hover:underline"
          >
            y {g.filas.length - visibles.length} más →
          </Link>
        </p>
      )}
    </li>
  );
}

function FilaEquipo({ f, puedeEditar }: { f: FilaBitacora; puedeEditar: boolean }) {
  const unidad = (f.parte_id ? (f.parte_unidad ?? f.unidad) : f.unidad) ?? "";
  const cantidad = Number(f.cantidad);
  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md bg-slate-50/60 px-2 py-2 sm:bg-transparent sm:py-1.5 ${COLUMNAS}`}
    >
      <span className="min-w-0 sm:col-start-1 sm:row-start-1">
        <span className="block truncate font-medium text-slate-800">{f.modelo ?? `Ítem ${f.item_code}`}</span>
        <span className="block truncate text-xs text-slate-500">
          {etiquetaProceso(f)}
          {f.estaEnTaller ? ` · ${f.diasEnTaller} d en taller` : ""}
        </span>
      </span>

      {/* Una sola marca: arriba a la derecha en el teléfono, en su columna en pantallas anchas. */}
      <span className="flex items-center justify-end sm:col-start-4 sm:row-start-1 sm:justify-center">
        <MarcaSeleccionable
          asignacionId={f.id}
          inicial={f.marca}
          notaInicial={f.nota}
          puedeEditar={puedeEditar}
          titulo={`${f.modelo ?? `Ítem ${f.item_code}`} · ${f.equipo}`}
        />
      </span>

      <span className="col-span-2 text-xs tabular-nums text-slate-700 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-sm">
        <span className="sm:hidden text-slate-500">Piezas: </span>
        <b className="font-semibold">{cantidad}</b> {unidad}
      </span>

      <span className="col-span-2 flex min-w-0 items-center gap-2 text-xs text-slate-600 sm:col-span-1 sm:col-start-3 sm:row-start-1">
        <span className="truncate">
          <span className="font-medium text-slate-800">{f.ot ? `O.T. ${f.ot}` : "Sin O.T."}</span> · {pmCorto(f.numero_pedido)}
        </span>
        {f.estaEnTaller && esAlerta(f.plazo) && <ChipPlazo plazo={f.plazo} />}
      </span>

      <Link
        href={hrefAsignarDeFila(f)}
        className="col-span-2 rounded-md border border-brand-600 px-3 py-1.5 text-center text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 sm:col-span-1 sm:col-start-5 sm:row-start-1 sm:w-20"
      >
        Asignar
      </Link>
    </li>
  );
}
