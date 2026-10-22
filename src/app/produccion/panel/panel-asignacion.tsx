"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  PROCESOS,
  type EncargadoEquipo,
  type EquipoProduccion,
} from "@/lib/produccion/asignaciones";
import { disponibleDe, type MuebleFlujo } from "@/lib/produccion/flujo-mueble";
import { resumenPm, type GrupoOtPanel } from "@/lib/produccion/panel";
import { ORDEN_SUGERIDO } from "@/lib/produccion/ruta";
import AsignarLote, { type MuebleParaLote } from "@/app/produccion/asignaciones/asignar-lote";
import {
  FilaMueble,
  ResumenProceso,
} from "@/app/produccion/pedidos/[id]/asignaciones/flujo-muebles";

// Lo que falta por asignar de un mueble, en el formato de "Asignar varios a un equipo".
function paraLote(m: MuebleFlujo): MuebleParaLote {
  return { id: m.id, item_code: m.item_code, modelo: m.modelo, unidad: m.unidad, ...disponibleDe(m) };
}

const tieneTrabajo = (m: MuebleParaLote) => PROCESOS.some((p) => m.disponible[p] > 0);

// Los muebles liberados de varios PM y O.T. en el formato del flujo de un PM: por cada mueble,
// su ruta con el avance de cada paso (tocar un paso con "+" lo asigna a un equipo) y, al abrirlo,
// las asignaciones con sus entregas. Va agrupado por O.T. y PM.
export default function PanelAsignacion({
  grupos,
  equipos,
  encargados,
  puedeEditar,
  detalles,
}: {
  grupos: GrupoOtPanel[];
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  puedeEditar: boolean;
  // Entregas y acciones de cada asignación, armadas en el servidor; por id de asignación.
  detalles: Record<string, ReactNode>;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);

  const muebles = useMemo(
    () => grupos.flatMap((g) => g.pms.flatMap((pm) => pm.muebles.map((m) => m.flujo))),
    [grupos]
  );
  const procesos = ORDEN_SUGERIDO.filter((p) => muebles.some((m) => m.ruta.some((x) => x.proceso === p)));
  // Asignar varios de una vez solo vale la pena si hay trabajo en más de un PM (con un solo PM
  // basta el botón de ese PM).
  const pmsConTrabajo = grupos
    .flatMap((g) => g.pms)
    .filter((pm) => pm.muebles.some((m) => tieneTrabajo(paraLote(m.flujo))));
  const paraTodos = pmsConTrabajo.flatMap((pm) => pm.muebles.map((m) => paraLote(m.flujo))).filter(tieneTrabajo);

  return (
    <section className="flex flex-col gap-5">
      {procesos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {procesos.map((p) => (
            <ResumenProceso key={p} proceso={p} muebles={muebles} />
          ))}
        </div>
      )}

      {puedeEditar && pmsConTrabajo.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
          <p className="text-slate-600">
            {paraTodos.length} muebles de {pmsConTrabajo.length} PM tienen algo por asignar.
          </p>
          <AsignarLote
            muebles={paraTodos}
            equipos={equipos}
            encargados={encargados}
            etiqueta={`Asignar todos a un equipo (${paraTodos.length})`}
          />
        </div>
      )}

      {grupos.map((g) => (
        <div key={g.ot ?? "sin-ot"} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {g.ot ? (
                <Link href={`/produccion/ot/${g.ot}`} className="hover:underline">
                  O.T. {g.ot}
                </Link>
              ) : (
                "Sin O.T."
              )}
            </h2>
            <span className="text-sm text-slate-500">
              {g.total} mueble{g.total === 1 ? "" : "s"}
            </span>
          </div>

          {g.pms.map((pm) => {
            const resumen = resumenPm(pm);
            const lote = pm.muebles.map((m) => paraLote(m.flujo)).filter(tieneTrabajo);
            const asignar = puedeEditar
              ? { equipos, encargados, numeroPedido: pm.numeroPm }
              : null;
            return (
              <article
                key={pm.pedidoId}
                className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 shadow-sm"
              >
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-4 py-3">
                  <Link
                    href={`/produccion/pedidos/${pm.pedidoId}`}
                    className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                  >
                    {pm.numeroPm}
                  </Link>
                  {pm.proyecto && <span className="text-sm text-slate-500">{pm.proyecto}</span>}
                  <span className="flex flex-wrap gap-x-3 text-xs font-medium">
                    {resumen.por_asignar > 0 && (
                      <span className="text-amber-700">{resumen.por_asignar} por asignar</span>
                    )}
                    {resumen.en_proceso > 0 && (
                      <span className="text-sky-700">{resumen.en_proceso} en proceso</span>
                    )}
                    {resumen.terminado > 0 && (
                      <span className="text-emerald-700">
                        {resumen.terminado} terminado{resumen.terminado === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  {puedeEditar && lote.length > 1 && (
                    <div className="ml-auto">
                      <AsignarLote
                        muebles={lote}
                        equipos={equipos}
                        encargados={encargados}
                        etiqueta={`Asignar ${lote.length} a un equipo`}
                      />
                    </div>
                  )}
                </header>
                <ul className="flex flex-col gap-2 p-3">
                  {pm.muebles.map((m) => (
                    <FilaMueble
                      key={m.flujo.id}
                      mueble={m.flujo}
                      asignar={asignar}
                      detalles={detalles}
                      abierto={abierto === m.flujo.id}
                      onAlternar={() => setAbierto(abierto === m.flujo.id ? null : m.flujo.id)}
                    />
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      ))}
    </section>
  );
}
