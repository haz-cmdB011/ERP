import BarraAvance from "@/components/barra-avance";
import ChipEstado from "@/components/chip-estado";
import type { AvancePlan } from "@/lib/planeacion/avance-planeacion";

// Columna "Avance" de la lista de Pedidos de Planeación: cuánto de la O.T. ya se
// liberó a Producción (solo la barra) y, si hay, cuántos ítems están en revisión o
// cancelados, que son los que Planeación tiene que resolver.
export default function AvanceOt({ avance }: { avance: AvancePlan }) {
  const { vigentes, liberados, enRevision, cancelados } = avance;
  if (vigentes === 0) {
    return (
      <ChipEstado tono="neutro">{cancelados > 0 ? "Todo cancelado" : "Sin ítems"}</ChipEstado>
    );
  }
  const porcentaje = Math.round((liberados / vigentes) * 100);
  return (
    <div className="flex min-w-24 flex-col gap-1.5">
      <BarraAvance
        porcentaje={porcentaje}
        etiqueta={`${liberados} de ${vigentes} ítems liberados a Producción`}
        color={porcentaje === 100 ? "bg-emerald-500" : "bg-brand-500"}
        pendiente
      />
      {(enRevision > 0 || cancelados > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {enRevision > 0 && <ChipEstado tono="alerta">{enRevision} en revisión</ChipEstado>}
          {cancelados > 0 && (
            <ChipEstado tono="neutro">
              {cancelados} cancelado{cancelados === 1 ? "" : "s"}
            </ChipEstado>
          )}
        </div>
      )}
    </div>
  );
}
