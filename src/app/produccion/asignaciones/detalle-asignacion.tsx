import ImagenAmpliable from "@/components/imagen-ampliable";
import IconoMenu, { type NombreIcono } from "@/components/iconos-menu";
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
import { hoyMexico, PROCESO_LABELS } from "@/lib/produccion/asignaciones";
import AccionConMotivo from "./accion-con-motivo";
import type { ParteEntrega } from "@/lib/produccion/entregas-partes";
import RegistrarEntrega from "./registrar-entrega";
import VerificarEntrega from "./verificar-entrega";

const REVISION: Record<RevisionEntrega, { texto: string; clase: string }> = {
  por_verificar: { texto: "Por verificar", clase: "text-amber-700" },
  verificada: { texto: "En Calidad", clase: "text-emerald-700" },
  rechazada: { texto: "Rechazada", clase: "text-rose-700" },
  anulada: { texto: "Anulada", clase: "text-rose-700" },
};

const ICONO_ESTADO: Record<AsignacionResumen["estado"], NombreIcono> = {
  en_proceso: "reloj",
  parcial: "entregas",
  entregada: "check",
  cancelada: "cancelados",
};

export function EstadoAsignacionBadge({ estado }: { estado: AsignacionResumen["estado"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${ESTADO_ASIGNACION_ESTILOS[estado]}`}
    >
      <IconoMenu nombre={ICONO_ESTADO[estado]} className="h-3 w-3" />
      {ESTADO_ASIGNACION_LABELS[estado]}
    </span>
  );
}

// Cuánto lleva una entrega esperando la revisión del trabajador.
function EsperandoVerificacion({ desde }: { desde: string }) {
  const dias = diasEsperando(desde, hoyMexico());
  if (dias === 0) return <p className="text-amber-700">Registrada hoy, por verificar.</p>;
  return (
    <p className={`${dias >= DIAS_SIN_VERIFICAR ? "font-medium text-amber-800" : "text-amber-700"}`}>
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
  partes,
}: {
  asignacion: AsignacionResumen;
  entregas: EntregaConFoto[];
  puedeEditar: boolean;
  puedeAnular: boolean;
  // Partes del despiece del mueble, para entregar por partes (ver partesParaEntrega).
  partes?: ParteEntrega[];
}) {
  const pendiente = Math.round((Number(a.cantidad) - Number(a.entregado)) * 100) / 100;
  const descripcion = `${a.numero_pedido} · ${a.modelo ?? `ítem ${a.item_code}`} · ${a.equipo}`;
  const vigentes = entregas.filter((e) => !e.anulada_en && !e.rechazada_en).length;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {a.folio_rechazo && (
        <p className="text-slate-500">
          Retrabajo de las piezas que Calidad rechazó con el folio{" "}
          <span className="font-mono font-medium text-rose-700">{a.folio_rechazo}</span>.
        </p>
      )}
      {a.notas && <p className="text-slate-500">Notas: {a.notas}</p>}
      {a.cancelada_en && (
        <p className="text-slate-500">
          Cancelada el {formatoFecha(a.cancelada_en)}: {a.motivo_cancelacion}
        </p>
      )}

      {entregas.length === 0 ? (
        !a.cancelada_en && <p className="text-slate-500">Sin entregas todavía.</p>
      ) : (
        // Las entregas, una tras otra y a la sombra de la asignación: una línea fina a la izquierda las
        // agrupa, sin cajas.
        <ul className="flex flex-col gap-3 border-l-2 border-slate-100 pl-4">
          {entregas.map((e) => {
            const revision = revisionEntrega(e);
            const fuera = revision === "anulada" || revision === "rechazada";
            const evaluadas = e.calidad.reduce((s, c) => s + c.cantidad, 0);
            const etiqueta =
              revision === "verificada" && evaluadas >= Number(e.cantidad)
                ? { texto: "Evaluada por Calidad", clase: "text-slate-600" }
                : REVISION[revision];
            return (
              <li key={e.id} className={`flex flex-wrap items-start gap-x-4 gap-y-2 ${fuera ? "opacity-60" : ""}`}>
                {/* Solo las entregas viejas traen foto; las nuevas se registran sin ella. */}
                {e.fotoUrl && (
                  <ImagenAmpliable url={e.fotoUrl} alt="Foto de la hoja de entrega" className="h-14 w-14" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-medium tabular-nums text-slate-900">
                      {formatoFecha(e.fecha_entrega)}, {Number(e.cantidad)} {a.unidad ?? ""}
                    </span>
                    <span className={etiqueta.clase}>{etiqueta.texto}</span>
                  </p>
                  <p className="break-words text-slate-500">
                    Hoja <span className="font-mono">{e.folios_calidad}</span>
                  </p>
                  {e.calidad.length > 0 && (
                    <p className="flex flex-wrap gap-x-3">
                      {e.calidad.map((c) => (
                        <span key={c.id} className={c.aprobado ? "text-emerald-700" : "font-medium text-rose-700"}>
                          {c.folio}: {c.cantidad} {c.aprobado ? "aprobadas" : "rechazadas"}
                        </span>
                      ))}
                    </p>
                  )}
                  {revision === "por_verificar" && <EsperandoVerificacion desde={e.registrado_en} />}
                  {revision === "anulada" && <p className="text-slate-500">Motivo: {e.motivo_anulacion}</p>}
                  {revision === "rechazada" && (
                    <p className="text-slate-500">
                      Regresada al equipo el {formatoFecha(e.rechazada_en)}: {e.motivo_rechazo}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {pendiente > 0 && (
            <RegistrarEntrega
              asignacionId={a.id}
              descripcion={descripcion}
              pendiente={pendiente}
              unidad={a.unidad}
              fechaAsignacion={a.fecha_asignacion}
              cantidadAsignada={Number(a.cantidad)}
              partes={partes}
              procesoEtiqueta={PROCESO_LABELS[a.proceso]}
            />
          )}
          {vigentes === 0 && <AccionConMotivo accion="cancelar" id={a.id} descripcion={descripcion} />}
        </div>
      )}
    </div>
  );
}
