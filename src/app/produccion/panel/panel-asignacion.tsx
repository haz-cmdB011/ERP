"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Chevron from "@/components/chevron";
import {
  PROCESOS,
  type EncargadoEquipo,
  type EquipoProduccion,
} from "@/lib/produccion/asignaciones";
import { disponibleDe, seAsignaCompleto, type MuebleFlujo } from "@/lib/produccion/flujo-mueble";
import type { EstadoMueble } from "@/lib/produccion/flujo-mueble";
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

// Cuántos muebles se ven de entrada sin plegar nada; con más, solo se abren los primeros PM.
const MUEBLES_SIN_PLEGAR = 12;
const PM_ABIERTOS = 2;

// Lo que cuenta cada PM del panel (sobre todos sus muebles que pasan la búsqueda, no solo los
// que caben en la página).
export type ResumenPm = Record<EstadoMueble, number>;

const ESTADOS_RESUMEN: { estado: EstadoMueble; etiqueta: (n: number) => string; punto: string }[] = [
  { estado: "por_asignar", etiqueta: (n) => `${n} por asignar`, punto: "bg-amber-500" },
  { estado: "en_proceso", etiqueta: (n) => `${n} en proceso`, punto: "bg-sky-500" },
  { estado: "terminado", etiqueta: (n) => (n === 1 ? "1 terminado" : `${n} terminados`), punto: "bg-emerald-500" },
];

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
  resumenes,
}: {
  grupos: GrupoOtPanel[];
  // Por id de PM: cuántos muebles hay en cada estado (todos los que pasan la búsqueda).
  resumenes: Record<string, ResumenPm>;
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  puedeEditar: boolean;
  // Entregas y acciones de cada asignación, armadas en el servidor; por id de asignación.
  detalles: Record<string, ReactNode>;
  // Miniatura de cada mueble (por id), cuando tiene imagen.
  imagenes: Record<string, { url: string; urlGrande: string | null }>;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  // Lo que la persona abrió o cerró a mano, por PM; el resto sigue la regla por omisión.
  const [manual, setManual] = useState<Record<string, boolean>>({});

  const pms = grupos.flatMap((g) => g.pms.map((pm) => ({ ot: g.ot, pm })));
  const total = pms.reduce((n, x) => n + x.pm.muebles.length, 0);
  const plegarPorOmision = total > MUEBLES_SIN_PLEGAR;
  const estaAbierto = (id: string, i: number) => manual[id] ?? (!plegarPorOmision || i < PM_ABIERTOS);
  const hayCerrados = pms.some((x, i) => !estaAbierto(x.pm.pedidoId, i));
  const fijarTodos = (valor: boolean) => setManual(Object.fromEntries(pms.map((x) => [x.pm.pedidoId, valor])));

  // Asignar varios de una vez a un equipo: todo lo que tiene algo por asignar.
  const paraTodos = grupos
    .flatMap((g) => g.pms.flatMap((pm) => pm.muebles.map((m) => paraLote(m.flujo))))
    .filter(tieneTrabajo);

  return (
    <section className="flex flex-col">
      {((puedeEditar && paraTodos.length > 1) || pms.length > 1) && (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-3">
          {pms.length > 1 && (
            <button
              type="button"
              onClick={() => fijarTodos(hayCerrados)}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              {hayCerrados ? "Desplegar todo" : "Plegar todo"}
            </button>
          )}
          {puedeEditar && paraTodos.length > 1 && (
            <AsignarLote
              muebles={paraTodos}
              equipos={equipos}
              encargados={encargados}
              etiqueta={`Asignar varios (${paraTodos.length})`}
              discreto
            />
          )}
        </div>
      )}

      {pms.map(({ ot, pm }, i) => {
        const asignar = puedeEditar ? { equipos, encargados, numeroPedido: pm.numeroPm } : null;
        const desplegado = estaAbierto(pm.pedidoId, i);
        const resumen = resumenes[pm.pedidoId];
        const enPm = resumen ? resumen.por_asignar + resumen.en_proceso + resumen.terminado : pm.muebles.length;
        const idLista = `panel-pm-${pm.pedidoId}`;
        return (
          <section key={pm.pedidoId} className="flex flex-col gap-2 border-t border-slate-200 py-3 first-of-type:border-t-0">
            {/* Una línea: el PM (O.T. y proyecto al pasar el cursor), sus conteos y el enlace al PM. */}
            <h2 className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setManual({ ...manual, [pm.pedidoId]: !desplegado })}
                aria-expanded={desplegado}
                aria-controls={idLista}
                title={[ot ? `O.T. ${ot}` : "Sin O.T.", pm.proyecto].filter(Boolean).join(", ")}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-slate-100"
              >
                <Chevron abierto={desplegado} className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate text-base font-semibold text-slate-900">{pm.numeroPm}</span>
                {ot && <span className="hidden shrink-0 text-sm text-slate-400 sm:inline">O.T. {ot}</span>}
              </button>
              <span className="flex shrink-0 items-center gap-3 text-sm text-slate-600">
                {resumen &&
                  ESTADOS_RESUMEN.filter((e) => resumen[e.estado] > 0).map((e) => (
                    <span key={e.estado} title={e.etiqueta(resumen[e.estado])} className="inline-flex items-center gap-1.5 tabular-nums">
                      <span aria-hidden className={`h-2 w-2 rounded-full ${e.punto}`} />
                      {resumen[e.estado]}
                      <span className="sr-only">{e.etiqueta(resumen[e.estado])}</span>
                    </span>
                  ))}
                {pm.muebles.length < enPm && (
                  <span className="text-slate-400" title={`Se ven ${pm.muebles.length} de ${enPm}`}>
                    {pm.muebles.length}/{enPm}
                  </span>
                )}
              </span>
              <Link
                href={`/produccion/pedidos/${pm.pedidoId}`}
                title="Abrir el PM"
                aria-label={`Abrir ${pm.numeroPm}`}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </Link>
            </h2>
            {desplegado && (
              <ul id={idLista} className="flex flex-col gap-2">
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
            )}
          </section>
        );
      })}
    </section>
  );
}
