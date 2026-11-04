import { money } from "@/lib/estimaciones/motor-precio";

// Piezas visuales que comparten las capturas de recibo (Acabados, Armado, Electrificación).

// Pasos de la captura (datos → OT → piezas → guardar): el número dice el orden.
export function PasoNumero({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 font-serif text-sm font-semibold text-on-brand"
    >
      {n}
    </span>
  );
}

export function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5">
        <PasoNumero n={n} />
        <h2 className="font-serif text-lg font-semibold text-slate-900">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

export function TituloPiezas({ n }: { n: number }) {
  return (
    <div className="flex items-baseline gap-3 px-1 pt-2">
      <PasoNumero n={3} />
      <h2 className="font-serif text-xl font-semibold text-slate-900">Piezas trabajadas</h2>
      <span className="text-sm text-slate-500">
        {n} {n === 1 ? "renglón" : "renglones"}
      </span>
    </div>
  );
}

// La línea de cobro del maquilador: su precio PROPUESTO × la cantidad. Es una propuesta:
// Estimaciones la acepta o la cambia antes del pago.
export function BandaCobro({
  propuesto,
  cantidad,
  onPropuesto,
}: {
  propuesto: number | "";
  cantidad: number;
  onPropuesto: (valor: number | "") => void;
}) {
  return (
    <div className="-mx-4 -mb-4 mt-2 flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-brand-200 bg-brand-50 px-4 py-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-brand-900">Tu precio propuesto por pieza</span>
        <span className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-serif text-xl text-slate-500">
            $
          </span>
          <input
            type="number"
            min={0}
            step={10}
            inputMode="decimal"
            className="w-44 rounded-lg border-2 border-brand-300 bg-white py-2 pl-8 pr-3 font-serif text-2xl font-semibold tabular-nums text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
            value={propuesto}
            onChange={(e) => onPropuesto(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </span>
      </label>
      <span className="pb-3 text-lg tabular-nums text-brand-900">× {cantidad} pz</span>
      <span className="ml-auto text-right">
        <span className="block text-sm text-brand-900">Propones cobrar</span>
        <span className="block font-serif text-3xl font-semibold tabular-nums text-slate-900">
          {money(cantidad * (Number(propuesto) || 0))}
        </span>
      </span>
    </div>
  );
}

// Cabecera de un renglón: número, qué pieza es y lo que cobra, a la vista aunque esté plegado.
export function CabeceraRenglon({
  numero,
  titulo,
  detalle,
  cantidad,
  precio,
  colapsado,
  extra,
  onAlternar,
  onQuitar,
}: {
  numero: number;
  titulo: string;
  detalle: string;
  cantidad: number;
  precio: number;
  colapsado: boolean;
  extra?: React.ReactNode;
  onAlternar: () => void;
  onQuitar: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!colapsado}
      onClick={onAlternar}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAlternar();
        }
      }}
      className="flex cursor-pointer select-none items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600"
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`h-3.5 w-3.5 flex-shrink-0 text-slate-500 transition-transform ${colapsado ? "-rotate-90" : ""}`}
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.293l3.71-4.06a.75.75 0 1 1 1.11 1.01l-4.25 4.65a.75.75 0 0 1-1.11 0l-4.25-4.65a.75.75 0 0 1 .02-1.06Z"
          clipRule="evenodd"
        />
      </svg>
      <span className="w-9 flex-shrink-0 font-serif text-2xl font-semibold tabular-nums text-slate-400">
        {numero}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-slate-900">{titulo}</span>
        <span className="block truncate text-xs text-slate-500">{detalle}</span>
      </span>
      {extra}
      <span className="text-right">
        <span className="block font-serif text-lg font-semibold tabular-nums text-slate-900">
          {money(cantidad * precio)}
        </span>
        <span className="block text-xs tabular-nums text-slate-500">
          {cantidad} pz × {money(precio)}
        </span>
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onQuitar();
        }}
        aria-label={`Quitar el renglón ${numero}`}
        title="Quitar renglón"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-4 w-4" aria-hidden>
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
  );
}

export const CLASE_AGREGAR_RENGLON =
  "w-full rounded-xl border-2 border-dashed border-slate-300 px-4 py-5 text-base font-semibold text-slate-700 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-brand-600";

export const CLASE_FOLIO =
  "w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 font-mono text-2xl font-semibold tracking-wider text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";
