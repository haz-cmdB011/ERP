import AsignarForm from "@/app/produccion/asignaciones/asignar-form";
import ReasignarRetrabajo from "@/app/produccion/rechazos/reasignar-retrabajo";
import {
  PROCESO_LABELS,
  type EncargadoEquipo,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import type { OpcionPaso } from "@/lib/produccion/flujo-mueble";

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

// Producción desde el QR: asignar el paso que sigue y reasignar lo que Calidad rechazó,
// sin salir de la ficha. Usa los mismos formularios que la pantalla del PM y la de
// Rechazado por Calidad, así que valen las mismas reglas (tope por paso, adelantada).
export default function AsignarQr({
  itemId,
  descripcion,
  unidad,
  pasos,
  pasoInicial,
  equipos,
  encargados,
  rechazos,
}: {
  itemId: string;
  descripcion: string;
  unidad: string | null;
  pasos: OpcionPaso[];
  pasoInicial: number | null;
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  rechazos: RechazoQr[];
}) {
  const sigue = pasos.find((p) => p.indice === pasoInicial && p.disponible > 0) ?? pasos.find((p) => p.disponible > 0);
  return (
    <div className="flex flex-col gap-3">
      {sigue ? (
        <div className="flex flex-col gap-1">
          <AsignarForm
            itemId={itemId}
            descripcion={descripcion}
            unidad={unidad}
            pasos={pasos}
            equipos={equipos}
            encargados={encargados}
            pasoInicial={sigue.indice}
            className="flex min-h-11 w-full flex-col justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-left text-sm font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-400"
          >
            Asignar a un equipo
          </AsignarForm>
          <p className="text-xs text-slate-500">
            Sigue {sigue.etiqueta}: {fmt(sigue.disponible)} {unidad ?? "pz"} por asignar
            {sigue.anterior ? ` · ${fmt(sigue.listo)} listas de ${sigue.anterior}` : ""}.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Todos los pasos de la ruta ya están asignados completos.</p>
      )}

      {rechazos.length > 0 && (
        <section aria-labelledby="rechazos-qr" className="flex flex-col gap-2">
          <h3 id="rechazos-qr" className="text-sm font-semibold text-rose-700">
            Rechazado por Calidad
          </h3>
          <ul className="flex flex-col gap-2">
            {rechazos.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-white p-3"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-slate-900">
                    {fmt(r.pendiente)} {unidad ?? "pz"} por reasignar
                    <span className="ml-2 font-mono text-xs text-rose-700">{r.folio}</span>
                  </p>
                  <p className="text-xs text-slate-600">
                    {r.revisionFinal ? "Revisión final" : "Lote"} · va a {PROCESO_LABELS[r.proceso]}
                  </p>
                  {r.motivo && <p className="mt-0.5 text-slate-700">{r.motivo}</p>}
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
      )}
    </div>
  );
}
