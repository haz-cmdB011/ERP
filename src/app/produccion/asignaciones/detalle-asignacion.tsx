import ImagenAmpliable from "@/components/imagen-ampliable";
import {
  ESTADO_ASIGNACION_ESTILOS,
  ESTADO_ASIGNACION_LABELS,
  formatoFecha,
  revisionEntrega,
  type AsignacionResumen,
  type RevisionEntrega,
} from "@/lib/produccion/asignaciones";
import type { EntregaConFoto } from "@/lib/produccion/consultar-asignaciones";
import { DIAS_SIN_VERIFICAR, diasEsperando } from "@/lib/produccion/detenidos";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import AccionConMotivo from "./accion-con-motivo";
import RegistrarEntrega from "./registrar-entrega";
import VerificarEntrega from "./verificar-entrega";

const REVISION: Record<RevisionEntrega, { texto: string; clase: string }> = {
  por_verificar: { texto: "POR VERIFICAR", clase: "text-amber-700" },
  verificada: { texto: "EN CALIDAD", clase: "text-emerald-700" },
  rechazada: { texto: "RECHAZADA", clase: "text-rose-700" },
  anulada: { texto: "ANULADA", clase: "text-rose-700" },
};

export function EstadoAsignacionBadge({ estado }: { estado: AsignacionResumen["estado"] }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${ESTADO_ASIGNACION_ESTILOS[estado]}`}
    >
      {ESTADO_ASIGNACION_LABELS[estado]}
    </span>
  );
}

// Cuánto lleva una entrega esperando la revisión del trabajador.
function EsperandoVerificacion({ desde }: { desde: string }) {
  const dias = diasEsperando(desde, hoyMexico());
  if (dias === 0) return <p className="text-xs text-amber-700">Registrada hoy, por verificar.</p>;
  return (
    <p className={`text-xs ${dias >= DIAS_SIN_VERIFICAR ? "font-medium text-amber-800" : "text-amber-700"}`}>
      {dias >= DIAS_SIN_VERIFICAR ? "⚠ " : ""}Lleva {dias} día{dias === 1 ? "" : "s"} sin verificar.
    </p>
  );
}

// Historial de entregas de una asignación (con foto de los folios) y sus
// acciones: registrar entrega, verificarla (pasa a Calidad) o rechazarla
// (regresa al equipo), cancelar la asignación, anular una entrega.
export default function DetalleAsignacion({
  asignacion: a,
  entregas,
  puedeEditar,
  puedeAnular,
}: {
  asignacion: AsignacionResumen;
  entregas: EntregaConFoto[];
  puedeEditar: boolean;
  puedeAnular: boolean;
}) {
  const pendiente = Math.round((Number(a.cantidad) - Number(a.entregado)) * 100) / 100;
  const descripcion = `${a.numero_pedido} · ${a.modelo ?? `ítem ${a.item_code}`} · ${a.equipo}`;
  const vigentes = entregas.filter((e) => !e.anulada_en && !e.rechazada_en).length;

  return (
    <div className="flex flex-col gap-3">
      {a.folio_rechazo && (
        <p className="text-sm text-slate-600">
          Retrabajo de las piezas que Calidad rechazó con el folio{" "}
          <span className="font-mono font-medium text-rose-700">{a.folio_rechazo}</span>.
        </p>
      )}
      {a.notas && <p className="text-sm text-slate-600">Notas: {a.notas}</p>}
      {a.cancelada_en && (
        <p className="text-sm text-slate-600">
          Cancelada el {formatoFecha(a.cancelada_en)}: {a.motivo_cancelacion}
        </p>
      )}

      {entregas.length === 0 ? (
        <p className="text-sm text-slate-500">Sin entregas registradas.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entregas.map((e) => {
            const revision = revisionEntrega(e);
            const fuera = revision === "anulada" || revision === "rechazada";
            const evaluadas = e.calidad.reduce((s, c) => s + c.cantidad, 0);
            const etiqueta =
              revision === "verificada" && evaluadas >= Number(e.cantidad)
                ? { texto: "EVALUADA POR CALIDAD", clase: "text-slate-600" }
                : REVISION[revision];
            return (
              <li
                key={e.id}
                className={`flex flex-wrap items-start gap-3 rounded-lg border p-2 ${
                  fuera
                    ? "border-slate-200 bg-slate-50 opacity-70"
                    : revision === "por_verificar"
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-slate-200 bg-white"
                }`}
              >
                {e.fotoUrl ? (
                  <ImagenAmpliable url={e.fotoUrl} alt="Foto de la hoja de entrega" className="h-16 w-16" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-600">
                    Sin foto
                  </span>
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-slate-900">
                    {formatoFecha(e.fecha_entrega)} · {Number(e.cantidad)} {a.unidad ?? ""}
                    <span className={`ml-2 text-xs font-semibold ${etiqueta.clase}`}>{etiqueta.texto}</span>
                  </p>
                  <p className="break-words text-xs text-slate-700">
                    Hoja: <span className="font-mono">{e.folios_calidad}</span>
                  </p>
                  {e.calidad.length > 0 && (
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      {e.calidad.map((c) => (
                        <span key={c.id} className={c.aprobado ? "text-emerald-700" : "font-medium text-rose-700"}>
                          {c.folio}: {c.cantidad} {c.aprobado ? "aprobadas" : "rechazadas"}
                        </span>
                      ))}
                    </p>
                  )}
                  {revision === "por_verificar" && <EsperandoVerificacion desde={e.registrado_en} />}
                  {revision === "anulada" && <p className="text-xs text-slate-500">Motivo: {e.motivo_anulacion}</p>}
                  {revision === "rechazada" && (
                    <p className="text-xs text-slate-500">
                      Regresada al equipo el {formatoFecha(e.rechazada_en)}: {e.motivo_rechazo}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {puedeEditar && revision === "por_verificar" && (
                    <>
                      <VerificarEntrega id={e.id} />
                      <AccionConMotivo
                        accion="rechazar"
                        id={e.id}
                        descripcion={`${descripcion} · ${formatoFecha(e.fecha_entrega)}`}
                      />
                    </>
                  )}
                  {puedeAnular && !fuera && e.calidad.length === 0 && (
                    <AccionConMotivo
                      accion="anular"
                      id={e.id}
                      descripcion={`${descripcion} · ${formatoFecha(e.fecha_entrega)}`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {puedeEditar && !a.cancelada_en && (
        <div className="flex flex-wrap gap-2">
          {pendiente > 0 && (
            <RegistrarEntrega
              asignacionId={a.id}
              descripcion={descripcion}
              pendiente={pendiente}
              unidad={a.unidad}
              fechaAsignacion={a.fecha_asignacion}
            />
          )}
          {vigentes === 0 && <AccionConMotivo accion="cancelar" id={a.id} descripcion={descripcion} />}
        </div>
      )}
    </div>
  );
}
