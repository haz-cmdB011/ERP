import type { PendientesCaptura } from "@/lib/estimaciones/pendientes-captura";

// Lo que falta resolver antes de guardar, junto a los totales: así se corrige
// antes de que lo rechacen al guardar o al revisar.
export default function AvisosCaptura({
  pendientes,
  descuadres,
}: {
  pendientes: PendientesCaptura;
  descuadres: number;
}) {
  const chips: { texto: string; estilo: string }[] = [];
  if (pendientes.sinPrecio > 0) {
    chips.push({
      texto: `${pendientes.sinPrecio} sin precio`,
      estilo: "bg-rose-50 text-rose-700 ring-rose-200",
    });
  }
  if (pendientes.porJustificar > 0) {
    chips.push({
      texto: `${pendientes.porJustificar} por justificar`,
      estilo: "bg-rose-50 text-rose-700 ring-rose-200",
    });
  }
  if (descuadres > 0) {
    chips.push({
      texto: `${descuadres} no concuerda${descuadres === 1 ? "" : "n"} con el PM`,
      estilo: "bg-amber-50 text-amber-700 ring-amber-200",
    });
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="status" aria-label="Pendientes del recibo">
      {chips.map((c) => (
        <span key={c.texto} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${c.estilo}`}>
          {c.texto}
        </span>
      ))}
    </div>
  );
}
