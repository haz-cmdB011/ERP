import ReasignarRetrabajo from "@/app/produccion/rechazos/reasignar-retrabajo";
import { PROCESO_LABELS, type EquipoProduccion, type Proceso } from "@/lib/produccion/asignaciones";

// Lo que Calidad rechazó de este mueble y falta reasignar: de un lote (folio CAL-,
// vista rechazos_calidad) o de la revisión final (folio FIN-, rechazos_revision_final).
export interface RechazoQr {
  id: string;
  folio: string;
  revisionFinal: boolean;
  // Proceso al que se reasigna (en la revisión final, el siguiente paso que le toca).
  proceso: Proceso;
  // Equipo que lo entregó, para sugerirlo (vacío en la revisión final).
  equipoOriginalId: string;
  pendiente: number;
  motivo: string | null;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

// Aviso de Producción en la ficha del QR: lo rechazado por Calidad que hay que volver a
// asignar, con el mismo botón "Reasignar" de la pantalla Rechazado por Calidad (mismas
// reglas: el retrabajo no cuenta contra el tope del paso).
export default function RechazosQr({
  rechazos,
  descripcion,
  unidad,
  equipos,
}: {
  rechazos: RechazoQr[];
  descripcion: string;
  unidad: string | null;
  equipos: EquipoProduccion[];
}) {
  if (rechazos.length === 0) return null;
  const u = unidad ?? "pz";
  return (
    <section aria-labelledby="rechazos-qr" className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
      <h3 id="rechazos-qr" className="text-sm font-semibold text-rose-800">
        Calidad rechazó piezas: hay que reasignarlas
      </h3>
      <ul className="flex flex-col gap-2">
        {rechazos.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-2.5">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-slate-900">
                {fmt(r.pendiente)} {u} a {PROCESO_LABELS[r.proceso]}
                <span className="ml-2 font-mono text-xs text-rose-700">{r.folio}</span>
              </p>
              {r.motivo && <p className="line-clamp-2 text-xs text-slate-600">{r.motivo}</p>}
            </div>
            <ReasignarRetrabajo
              informeId={r.id}
              folio={r.folio}
              descripcion={descripcion}
              proceso={r.proceso}
              equipoOriginalId={r.equipoOriginalId}
              porReasignar={r.pendiente}
              unidad={unidad}
              equipos={equipos}
              revisionFinal={r.revisionFinal}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
