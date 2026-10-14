import {
  resumirContraCalidad,
  sinAprobarPorCalidad,
  type RenglonContraCalidad,
} from "@/lib/estimaciones/recibo-contra-calidad";

// Lo cobrado en un recibo contra lo que Calidad ya aprobó. Se muestra al revisar
// el recibo (Acabados y Armado). Es solo un aviso: no bloquea la revisión ni el
// pago, y desaparece cuando Calidad aprueba.
export default function CalidadRecibo({ lineas }: { lineas: RenglonContraCalidad[] | null }) {
  if (!lineas || lineas.length === 0) return null;
  const { conDiferencia, cuadran, sinDato } = resumirContraCalidad(lineas);

  if (conDiferencia.length === 0) {
    if (cuadran === 0) {
      return (
        <p className="text-xs text-slate-500">
          Calidad: no hay aprobaciones con qué comparar este recibo (sus muebles no pasaron por Producción en el
          sistema).
        </p>
      );
    }
    return (
      <p className="text-xs text-emerald-800">
        <span aria-hidden>✓</span> Lo cobrado en este recibo coincide con lo que Calidad ya aprobó
        {sinDato > 0 && ` (${sinDato} ${sinDato === 1 ? "renglón" : "renglones"} sin dato de Calidad)`}.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
      <h2 className="font-semibold text-amber-950">Cobrado que Calidad todavía no aprueba</h2>
      <p className="text-xs text-amber-900">
        Solo es un aviso: no bloquea la revisión ni el pago. Si Calidad aprueba después, este aviso desaparece.
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
            Renglón {l.numero}: cobrado acumulado {l.acumulado} · Calidad aprobó {l.aprobado} (
            {sinAprobarPorCalidad(l)} sin aprobar)
          </p>
        </div>
      ))}
      {sinDato > 0 && (
        <p className="text-xs text-slate-500">
          {sinDato} {sinDato === 1 ? "renglón" : "renglones"} sin dato de Calidad.
        </p>
      )}
    </section>
  );
}
