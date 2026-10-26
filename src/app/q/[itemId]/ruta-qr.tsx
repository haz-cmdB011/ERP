import ChipEstado, { type TonoChip } from "@/components/chip-estado";
import type { EstadoTramo, ResumenRuta } from "@/lib/trazabilidad/resumen-ruta";

const BARRA: Record<EstadoTramo, string> = {
  hecho: "bg-emerald-500",
  en_curso: "bg-sky-500",
  pendiente: "bg-slate-200",
};

const CHIP: Record<EstadoTramo, TonoChip> = {
  hecho: "ok",
  en_curso: "proceso",
  pendiente: "neutro",
};

// Tarjeta de estado de la ficha del QR: dónde va el mueble en una frase y una barra con
// un tramo por paso del recorrido (ver lib/trazabilidad/resumen-ruta.ts). Al tocarla se
// abre la ruta completa, paso por paso. El tramo donde va el mueble es más grueso.
export default function RutaQr({ resumen: r, completa }: { resumen: ResumenRuta; completa: boolean }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-col gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-base font-semibold text-slate-900">{r.titulo}</span>
          {completa && r.actual !== null && (
            <span className="shrink-0 text-xs text-slate-500">
              Paso {r.actual + 1} de {r.tramos.length}
            </span>
          )}
        </span>
        {r.detalle && <span className="-mt-1.5 text-sm text-slate-600">{r.detalle}</span>}
        <span aria-hidden="true" className="flex items-center gap-1">
          {r.tramos.map((t, i) => (
            <span
              key={`${t.etiqueta}-${i}`}
              className={`flex-1 rounded-full ${BARRA[t.estado]} ${i === r.actual ? "h-2.5" : "h-1.5"}`}
            />
          ))}
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-brand-700">
          <span className="group-open:hidden">{completa ? "Ver la ruta completa" : "Ver el detalle"}</span>
          <span className="hidden group-open:inline">{completa ? "Ocultar la ruta" : "Ocultar el detalle"}</span>
          <span aria-hidden="true" className="transition-transform group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      <ol aria-label="Ruta del mueble" className="flex flex-col divide-y divide-slate-100 border-t border-slate-100">
        {r.tramos.map((t, i) => (
          <li
            key={`${t.etiqueta}-${i}`}
            aria-current={i === r.actual ? "step" : undefined}
            className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${i === r.actual ? "bg-brand-50/60" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-600">
                {i + 1}
              </span>
              <span className="truncate font-medium text-slate-900">{t.etiqueta}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
              {t.cifra && <span>{t.cifra}</span>}
              <ChipEstado tono={CHIP[t.estado]}>{t.texto}</ChipEstado>
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
