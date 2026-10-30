"use client";

import { useState, type ReactNode } from "react";
import BotonDesplegar from "@/components/boton-desplegar";
import { agruparPorCliente } from "@/lib/planeacion/vista-lista";
import {
  PROCESOS,
  type EncargadoEquipo,
  type EquipoProduccion,
} from "@/lib/produccion/asignaciones";
import { disponibleDe, seAsignaCompleto, type EstadoMueble, type MuebleFlujo } from "@/lib/produccion/flujo-mueble";
import { contarEstados, resumenOt, resumenPm, type GrupoOtPanel } from "@/lib/produccion/panel";
import AsignarLote, { type MuebleParaLote } from "@/app/produccion/asignaciones/asignar-lote";
import { FilaMueble } from "@/app/produccion/pedidos/[id]/asignaciones/flujo-muebles";

// Lo que falta por asignar de un mueble, en el formato de "Asignar varios a un equipo".
// Uno que se asigna por partes no entra: queda sin nada por asignar en el lote.
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

// Cada nivel ocupa el ancho completo del anterior (nada se corre a la derecha al abrirlo) y su
// profundidad se marca con el tono del encabezado, un paso más gris por nivel.
const TONO = {
  cliente: "bg-white hover:bg-slate-50",
  ot: "bg-slate-50 hover:bg-slate-100",
  pm: "bg-slate-100 hover:bg-slate-200/70",
};

// Los controles de un encabezado no deben desplegar/contraer su bloque.
const sinToggle = (e: React.MouseEvent) => e.stopPropagation();

// Cuántos muebles van por asignar, en proceso y terminados (encabezado de un cliente, una O.T. o un PM).
function Estados({ resumen }: { resumen: Record<EstadoMueble, number> }) {
  return (
    <span className="flex flex-wrap gap-x-3 text-xs font-medium">
      {resumen.por_asignar > 0 && <span className="text-amber-700">{resumen.por_asignar} por asignar</span>}
      {resumen.en_proceso > 0 && <span className="text-sky-700">{resumen.en_proceso} en proceso</span>}
      {resumen.terminado > 0 && (
        <span className="text-emerald-700">
          {resumen.terminado} terminado{resumen.terminado === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}

// Los muebles liberados de varios PM y O.T. en el formato del flujo de un PM: por cada mueble,
// su ruta con el avance de cada paso (tocar un paso con "+" lo asigna a un equipo) y, al abrirlo,
// las asignaciones con sus entregas. Va agrupado por cliente (como la lista de Pedidos), O.T. y
// PM, y cada nivel se despliega ahí mismo, sin cambiar de pantalla: cerrado, un cliente muestra
// solo su resumen; abierto, sus O.T.; abierta una O.T., sus PM; y abierto un PM, sus muebles.
export default function PanelAsignacion({
  grupos,
  equipos,
  encargados,
  puedeEditar,
  detalles,
  imagenes,
  abrirTodo,
}: {
  grupos: GrupoOtPanel[];
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  puedeEditar: boolean;
  // Entregas y acciones de cada asignación, armadas en el servidor; por id de asignación.
  detalles: Record<string, ReactNode>;
  // Miniatura de cada mueble (por id), cuando tiene imagen.
  imagenes: Record<string, { url: string; urlGrande: string | null }>;
  // Cómo se ve cada cliente, O.T. y PM mientras nadie los haya abierto o cerrado a mano.
  abrirTodo: boolean;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  // Clientes, O.T. y PM abiertos o cerrados a mano (true/false); sin entrada, rige `abrirTodo`.
  const [clientesAbiertos, setClientesAbiertos] = useState<Record<string, boolean>>({});
  const [otsAbiertas, setOtsAbiertas] = useState<Record<string, boolean>>({});
  const [pmsAbiertos, setPmsAbiertos] = useState<Record<string, boolean>>({});

  const clientes = agruparPorCliente(grupos, (g) => g.cliente);
  const claveOt = (g: GrupoOtPanel) => g.ot ?? "sin-ot";
  // Con un solo cliente no hay nada que esconder: se abre solo.
  const clienteAbierto = (c: string) => clientesAbiertos[c] ?? (abrirTodo || clientes.length === 1);
  const otAbierta = (g: GrupoOtPanel) => otsAbiertas[claveOt(g)] ?? abrirTodo;
  const pmAbierto = (id: string) => pmsAbiertos[id] ?? abrirTodo;

  function desplegarTodo(abrir: boolean) {
    setClientesAbiertos(Object.fromEntries(clientes.map((c) => [c.cliente, abrir])));
    setOtsAbiertas(Object.fromEntries(grupos.map((g) => [claveOt(g), abrir])));
    setPmsAbiertos(Object.fromEntries(grupos.flatMap((g) => g.pms.map((pm) => [pm.pedidoId, abrir]))));
  }

  // Asignar varios de una vez solo vale la pena si hay trabajo en más de un PM (con un solo PM
  // basta el botón de ese PM).
  const pmsConTrabajo = grupos
    .flatMap((g) => g.pms)
    .filter((pm) => pm.muebles.some((m) => tieneTrabajo(paraLote(m.flujo))));
  const paraTodos = pmsConTrabajo.flatMap((pm) => pm.muebles.map((m) => paraLote(m.flujo))).filter(tieneTrabajo);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => desplegarTodo(true)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          Desplegar todo
        </button>
        <button
          type="button"
          onClick={() => desplegarTodo(false)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          Contraer todo
        </button>
        {puedeEditar && pmsConTrabajo.length > 1 && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-600">
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
      </div>

      {clientes.map((c) => {
        const abiertoCliente = clienteAbierto(c.cliente);
        const alternarCliente = () => setClientesAbiertos((prev) => ({ ...prev, [c.cliente]: !abiertoCliente }));
        const muebles = c.filas.flatMap((g) => g.pms.flatMap((pm) => pm.muebles));
        return (
          <section key={c.cliente} className="overflow-hidden rounded-xl border border-slate-200 bg-white/50">
            <div
              onClick={alternarCliente}
              className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors ${TONO.cliente}`}
            >
              <BotonDesplegar
                abierto={abiertoCliente}
                alAlternar={alternarCliente}
                descripcion={`las ${c.filas.length} O.T. de ${c.cliente}`}
                className="h-4 w-4"
              />
              <h2 className="text-lg font-semibold text-slate-900">{c.cliente}</h2>
              <span className="text-sm text-slate-500">
                {c.filas.length} O.T. · {muebles.length} mueble{muebles.length === 1 ? "" : "s"}
              </span>
              <Estados resumen={contarEstados(muebles)} />
            </div>

            {abiertoCliente && (
              <div className="anim-desplegar divide-y divide-slate-200 border-t border-slate-200">
                {c.filas.map((g) => (
                  <GrupoOt
                    key={claveOt(g)}
                    g={g}
                    abierta={otAbierta(g)}
                    alternar={() => setOtsAbiertas((prev) => ({ ...prev, [claveOt(g)]: !otAbierta(g) }))}
                  >
                    {g.pms.map((pm) => {
                      const pmAbierta = pmAbierto(pm.pedidoId);
                      const alternarPm = () =>
                        setPmsAbiertos((prev) => ({ ...prev, [pm.pedidoId]: !pmAbierta }));
                      const lote = pm.muebles.map((m) => paraLote(m.flujo)).filter(tieneTrabajo);
                      const asignar = puedeEditar
                        ? { equipos, encargados, numeroPedido: pm.numeroPm }
                        : null;
                      return (
                        <article key={pm.pedidoId} className="bg-white">
                          <div
                            onClick={alternarPm}
                            className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors ${TONO.pm}`}
                          >
                            <BotonDesplegar
                              abierto={pmAbierta}
                              alAlternar={alternarPm}
                              descripcion={`los ${pm.muebles.length} muebles del ${pm.numeroPm}`}
                            />
                            <span className="font-semibold text-slate-900">{pm.numeroPm}</span>
                            {pm.proyecto && <span className="text-sm text-slate-500">{pm.proyecto}</span>}
                            <span className="text-xs text-slate-500">
                              {pm.muebles.length} mueble{pm.muebles.length === 1 ? "" : "s"}
                            </span>
                            <Estados resumen={resumenPm(pm)} />
                            {puedeEditar && lote.length > 1 && (
                              <div className="ml-auto" onClick={sinToggle}>
                                <AsignarLote
                                  muebles={lote}
                                  equipos={equipos}
                                  encargados={encargados}
                                  etiqueta={`Asignar ${lote.length} a un equipo`}
                                />
                              </div>
                            )}
                          </div>
                          {pmAbierta && (
                            <ul className="anim-desplegar flex flex-col gap-2 border-t border-slate-100 bg-slate-50/60 p-3">
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
                        </article>
                      );
                    })}
                  </GrupoOt>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </section>
  );
}

// Una O.T. dentro de su cliente: cerrada, solo su resumen; abierta, sus PM.
function GrupoOt({
  g,
  abierta,
  alternar,
  children,
}: {
  g: GrupoOtPanel;
  abierta: boolean;
  alternar: () => void;
  children: ReactNode;
}) {
  const nombreOt = g.ot ? `la O.T. ${g.ot}` : "los PM sin O.T.";
  return (
    <section className="bg-white">
      <div
        onClick={alternar}
        className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors ${TONO.ot}`}
      >
        <BotonDesplegar
          abierto={abierta}
          alAlternar={alternar}
          descripcion={`los ${g.pms.length} PM de ${nombreOt}`}
          className="h-4 w-4"
        />
        <h3 className="text-base font-semibold text-slate-900">{g.ot ? `O.T. ${g.ot}` : "Sin O.T."}</h3>
        <span className="text-sm text-slate-500">
          {g.pms.length} PM · {g.total} mueble{g.total === 1 ? "" : "s"}
        </span>
        <Estados resumen={resumenOt(g)} />
      </div>

      {abierta && (
        <div className="anim-desplegar divide-y divide-slate-200 border-t border-slate-200">{children}</div>
      )}
    </section>
  );
}
