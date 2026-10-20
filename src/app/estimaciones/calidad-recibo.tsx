import {
  resumirContraCalidad,
  sinLiberar,
  type ReciboContraCalidad,
} from "@/lib/estimaciones/recibo-contra-calidad";
import { ETIQUETA_LIBERADO } from "@/lib/estimaciones/pm-cobrado";

// Lo cobrado en un recibo contra lo liberado para cobrar: lo que verificó
// Producción o, con el ajuste cobro_segun_produccion apagado, lo que aprobó
// Calidad. Se muestra al revisar el recibo (Acabados y Armado). Es solo un aviso:
// no bloquea la revisión ni el pago, y desaparece cuando se libera.
export default function CalidadRecibo({ contra }: { contra: ReciboContraCalidad | null }) {
  if (!contra || contra.lineas.length === 0) return null;
  const { lineas, base } = contra;
  const { conDiferencia, cuadran, sinDato } = resumirContraCalidad(lineas);
  const quien = base === "produccion" ? "Producción" : "Calidad";
  const liberado = ETIQUETA_LIBERADO[base];

  if (conDiferencia.length === 0) {
    if (cuadran === 0) {
      return (
        <p className="text-xs text-slate-500">
          {quien}: no hay nada liberado con qué comparar este recibo (sus muebles no pasaron por Producción en el
          sistema).
        </p>
      );
    }
    return (
      <p className="text-xs text-emerald-800">
        <span aria-hidden>✓</span> Lo cobrado en este recibo coincide con lo que{" "}
        {base === "produccion" ? "Producción ya verificó" : "Calidad ya aprobó"}
        {sinDato > 0 && ` (${sinDato} ${sinDato === 1 ? "renglón" : "renglones"} sin dato de ${quien})`}.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
      <h2 className="font-semibold text-amber-950">
        {base === "produccion" ? "Cobrado que Producción todavía no libera" : "Cobrado que Calidad todavía no aprueba"}
      </h2>
      <p className="text-xs text-amber-900">
        Solo es un aviso: no bloquea la revisión ni el pago. Si {quien}{" "}
        {base === "produccion" ? "libera" : "aprueba"} después, este aviso desaparece.
      </p>
      {conDiferencia.map((l) => (
        <div key={l.renglonId} className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-amber-200">
          <p className="font-medium text-amber-950">
            <span className="font-mono">{l.modelo}</span>
            {l.esComponente && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                componente
              </span>
            )}
            {l.descripcion && <span className="ml-2 text-xs font-normal text-amber-900">{l.descripcion}</span>}
          </p>
          <p className="text-xs text-amber-900">
            Renglón {l.numero}: cobrado acumulado {l.acumulado} · {liberado} {l.liberado} ({sinLiberar(l)} sin
            liberar)
            {base === "produccion" && l.aprobado != null && l.aprobado > 0 && ` · Calidad aprobó ${l.aprobado}`}
          </p>
        </div>
      ))}
      {sinDato > 0 && (
        <p className="text-xs text-slate-500">
          {sinDato} {sinDato === 1 ? "renglón" : "renglones"} sin dato de {quien}.
        </p>
      )}
    </section>
  );
}
