import EvaluarLote from "@/app/calidad/evaluar-lote";
import type { LoteCalidad } from "@/lib/calidad/lotes";

// Calidad en la ficha del QR: las entregas de este mueble con piezas por revisar, con el
// mismo asistente de la pantalla del pedido (evaluar_entrega_calidad). Con la revisión
// final encendida van plegadas: solo se usan si hay una falla en un proceso; apagada, son
// la forma normal de evaluar y van abiertas.
export default function EntregasCalidadQr({ lotes, plegadas }: { lotes: LoteCalidad[]; plegadas: boolean }) {
  if (lotes.length === 0) return null;
  const lista = (
    <ul className="flex flex-col gap-2">
      {lotes.map((l) => (
        <li key={l.entrega_id}>
          <EvaluarLote lote={l} compacto />
        </li>
      ))}
    </ul>
  );
  if (!plegadas) {
    return (
      <section aria-labelledby="entregas-qr" className="flex flex-col gap-2">
        <h3 id="entregas-qr" className="text-sm font-semibold text-slate-700">
          Entregas por revisar
        </h3>
        {lista}
      </section>
    );
  }
  return (
    <details className="group rounded-lg border border-slate-200 bg-white shadow-sm">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
        Revisar una entrega por proceso ({lotes.length})
        <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-slate-100 p-3">
        <p className="text-xs text-slate-500">
          Solo si encontraste una falla en un proceso. Lo normal es la revisión final del mueble completo.
        </p>
        {lista}
      </div>
    </details>
  );
}
