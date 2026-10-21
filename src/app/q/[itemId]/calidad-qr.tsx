import EvaluarLote from "@/app/calidad/evaluar-lote";
import { Revisar } from "@/app/calidad/pedidos/[id]/revision-final";
import type { ResumenRevisionFinal } from "@/lib/calidad/revision-final";
import type { LoteCalidad } from "@/lib/calidad/lotes";
import type { PanelCalidadQr } from "@/lib/trazabilidad/calidad-qr";

// Calidad desde el QR: la revisión final del mueble completo (aprobar, o rechazar con el
// motivo, dónde nació la falla y a qué paso regresa) y, como opción, revisar una entrega
// de un proceso. Usa los mismos formularios que la pantalla del pedido en Calidad, así
// que valen las mismas reglas (registrar_revision_final, evaluar_entrega_calidad).
export default function CalidadQr({
  panel,
  itemId,
  titulo,
  unidad,
  resumen,
  pasos,
  lotes,
  puedeEvaluar,
}: {
  panel: PanelCalidadQr;
  itemId: string;
  titulo: string;
  unidad: string | null;
  resumen: ResumenRevisionFinal | null;
  // Pasos guardados de la ruta, para elegir a dónde regresa lo rechazado.
  pasos: { id: string; etiqueta: string }[];
  // Entregas de este mueble con piezas por revisar.
  lotes: LoteCalidad[];
  puedeEvaluar: boolean;
}) {
  const u = unidad ?? "pz";
  const entregas =
    puedeEvaluar && lotes.length > 0 ? (
      <ul className="flex flex-col gap-2">
        {lotes.map((l) => (
          <li key={l.entrega_id}>
            <EvaluarLote lote={l} compacto />
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      {resumen && panel.revisionFinal === "liberado" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Liberado a obra: Calidad aprobó las {resumen.cantidad_total} {u} en la revisión final.
        </p>
      )}
      {resumen && panel.revisionFinal === "revisar" && (
        <div className="flex flex-col gap-1">
          <Revisar
            mueble={{ id: itemId, unidad, resumen, pasos }}
            titulo={titulo}
            className="flex min-h-11 w-full items-center rounded-xl bg-brand-500 px-4 py-2.5 text-left text-sm font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-400"
          />
          <p className="text-xs text-slate-500">
            {resumen.pendientes} {u} listas: ya pasaron por toda la ruta. Llevan {resumen.aprobadas} de{" "}
            {resumen.cantidad_total} aprobadas.
          </p>
        </div>
      )}
      {resumen && panel.revisionFinal === "listas" && (
        <p className="text-sm text-slate-600">
          {resumen.pendientes} {u} listas para la revisión final. Tu usuario no puede evaluar.
        </p>
      )}
      {resumen && panel.revisionFinal === "esperando" && (
        <p className="text-sm text-slate-600">
          Todavía no hay piezas listas para la revisión final: falta que Producción verifique el último paso de la
          ruta. Llevan {resumen.aprobadas} de {resumen.cantidad_total} {u} aprobadas.
        </p>
      )}

      {entregas &&
        (panel.entregasPlegadas ? (
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-90">
                ▸
              </span>
              Revisar una entrega por proceso ({lotes.length})
            </summary>
            <div className="flex flex-col gap-2 border-t border-slate-100 p-3">
              <p className="text-xs text-slate-500">
                Solo si encontraste una falla en un proceso. Lo normal es la revisión final del mueble completo.
              </p>
              {entregas}
            </div>
          </details>
        ) : (
          <section aria-labelledby="entregas-qr" className="flex flex-col gap-2">
            <h3 id="entregas-qr" className="text-sm font-semibold text-slate-700">
              Entregas por revisar
            </h3>
            {entregas}
          </section>
        ))}
    </div>
  );
}
