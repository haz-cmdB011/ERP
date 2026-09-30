import type { DiscrepanciaRecibo } from "@/lib/estimaciones/discrepancias-db";

// Diferencias con el PM de un recibo, con lo que decidió el administrador.
// Se muestra en la ficha de seguimiento y en la revisión de los tres tipos de
// recibo.
export default function DiscrepanciasRecibo({
  discrepancias,
  bloqueaPago = false,
}: {
  discrepancias: DiscrepanciaRecibo[];
  // En la revisión: avisa que el pago espera a que se decidan.
  bloqueaPago?: boolean;
}) {
  if (discrepancias.length === 0) return null;
  const sinResolver = discrepancias.filter((d) => d.estado === "pendiente").length;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 text-sm">
      <h2 className="font-semibold text-slate-900">Cantidades que no concuerdan con el PM</h2>
      {bloqueaPago && sinResolver > 0 && (
        <p className="text-xs text-amber-800">
          No se puede pagar hasta que el administrador de Estimaciones decida{" "}
          {sinResolver === 1 ? "esta diferencia" : `estas ${sinResolver} diferencias`}. Un renglón
          cuyo motivo no se acepte solo se paga con precio aceptado en 0.
        </p>
      )}
      {discrepancias.map((d) => (
        <div
          key={d.id}
          className={`rounded-lg px-3 py-2 ring-1 ${
            d.estado === "rechazada"
              ? "bg-rose-50 text-rose-900 ring-rose-200"
              : d.estado === "aceptada"
                ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
                : "bg-amber-50 text-amber-900 ring-amber-200"
          }`}
        >
          <p className="font-medium">
            <span className="font-mono">{d.modelo}</span> ·{" "}
            {d.estado === "rechazada"
              ? "Motivo NO aceptado"
              : d.estado === "aceptada"
                ? "Motivo aceptado"
                : "Pendiente de revisión del administrador"}
          </p>
          <p className="text-xs">
            {d.cantidadPm == null
              ? `El modelo no está en el PM de la OT (se capturaron ${d.cantidadCapturada} pz)`
              : `PM declara ${d.cantidadPm} pz · acumulado con este renglón ${d.cantidadAcumulada} pz (${d.cantidadAcumulada - d.cantidadPm} de más)`}
          </p>
          <p className="mt-1 text-xs">Motivo: {d.motivo}</p>
          {d.notaResolucion && (
            <p className="mt-1 text-xs">Respuesta del administrador: {d.notaResolucion}</p>
          )}
        </div>
      ))}
    </section>
  );
}
