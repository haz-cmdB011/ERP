"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  PROCESOS,
  type EncargadoEquipo,
  type EquipoProduccion,
} from "@/lib/produccion/asignaciones";
import { disponibleDe, seAsignaCompleto, type MuebleFlujo } from "@/lib/produccion/flujo-mueble";
import type { GrupoOtPanel } from "@/lib/produccion/panel";
import AsignarLote, { type MuebleParaLote } from "@/app/produccion/asignaciones/asignar-lote";
import { FilaMueble } from "@/app/produccion/pedidos/[id]/asignaciones/flujo-muebles";

// Lo que falta por asignar de un mueble, en el formato de "Asignar varios a un equipo".
// Uno de antes que trabajaba por partes no entra: queda sin nada por asignar en el lote.
function paraLote(m: MuebleFlujo): MuebleParaLote {
  const d = disponibleDe(m);
  const vacio = Object.fromEntries(PROCESOS.map((p) => [p, 0])) as typeof d.disponible;
  return {
    id: m.id,
    item_code: m.item_code,
    modelo: m.modelo,
    unidad: m.unidad,
    ...(seAsignaCompleto(m) ? d : { disponible: vacio, listo: vacio }),
  };
}

const tieneTrabajo = (m: MuebleParaLote) => PROCESOS.some((p) => m.disponible[p] > 0);

// Los muebles liberados en una sola lista: una cabecera delgada por PM (con su O.T. y proyecto)
// y debajo sus muebles, cada uno en una línea con su ruta y lo que sigue. Sin niveles que
// abrir: lo único que se despliega es el mueble, para ver sus asignaciones y entregas.
export default function PanelAsignacion({
  grupos,
  equipos,
  encargados,
  puedeEditar,
  detalles,
  imagenes,
}: {
  grupos: GrupoOtPanel[];
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  puedeEditar: boolean;
  // Entregas y acciones de cada asignación, armadas en el servidor; por id de asignación.
  detalles: Record<string, ReactNode>;
  // Miniatura de cada mueble (por id), cuando tiene imagen.
  imagenes: Record<string, { url: string; urlGrande: string | null }>;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);

  // Asignar varios de una vez a un equipo: todo lo que tiene algo por asignar.
  const paraTodos = grupos
    .flatMap((g) => g.pms.flatMap((pm) => pm.muebles.map((m) => paraLote(m.flujo))))
    .filter(tieneTrabajo);

  return (
    <section className="flex flex-col gap-6">
      {puedeEditar && paraTodos.length > 1 && (
        <div className="-mt-2 flex justify-end">
          <AsignarLote
            muebles={paraTodos}
            equipos={equipos}
            encargados={encargados}
            etiqueta={`Asignar varios a un equipo (${paraTodos.length})`}
          />
        </div>
      )}

      {grupos.flatMap((g) =>
        g.pms.map((pm) => {
          const asignar = puedeEditar ? { equipos, encargados, numeroPedido: pm.numeroPm } : null;
          return (
            <section key={pm.pedidoId} className="flex flex-col gap-2">
              <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1">
                <Link
                  href={`/produccion/pedidos/${pm.pedidoId}`}
                  className="text-base font-semibold text-slate-900 hover:underline"
                >
                  {pm.numeroPm}
                </Link>
                <span className="text-sm text-slate-500">{g.ot ? `O.T. ${g.ot}` : "Sin O.T."}</span>
                {pm.proyecto && <span className="truncate text-sm text-slate-500">{pm.proyecto}</span>}
              </h2>
              <ul className="flex flex-col gap-2">
                {pm.muebles.map((m) => (
                  <FilaMueble
                    key={m.flujo.id}
                    mueble={m.flujo}
                    asignar={asignar}
                    detalles={detalles}
                    imagen={imagenes[m.flujo.id] ?? null}
                    abierto={abierto === m.flujo.id}
                    onAlternar={() => setAbierto(abierto === m.flujo.id ? null : m.flujo.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}
