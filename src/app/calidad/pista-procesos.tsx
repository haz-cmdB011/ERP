"use client";

import { useState } from "react";
import EnlaceFila from "@/components/enlace-fila";
import { IconoCheck, IconoX } from "@/components/iconos-estado";
import { formatoFechaDMA } from "@/lib/resumen/entrega";
import type { EstacionPista, PistaMueble } from "@/lib/calidad/pista-procesos";
import EvaluarLote from "./evaluar-lote";

// Los procesos de un mueble en Calidad, en anillos como el panel de Producción: uno por paso
// de su ruta, lleno con lo que Calidad aprobó (verde), lo que falta revisar (ámbar) y lo que
// está en retrabajo (rosa). Al tocar un anillo se ven sus folios. Debajo, solo lo que hay que
// revisar.

const VERDE = "var(--color-emerald-500)";
const AMBAR = "var(--color-amber-400)";
const ROSA = "var(--color-rose-400)";
const VACIO = "var(--color-slate-200)";

function fondoAnillo(e: EstacionPista): string {
  const pct = (n: number) => (e.meta > 0 ? Math.min(100, (n / e.meta) * 100) : 0);
  const a = pct(e.aprobadas);
  const b = Math.min(100, a + pct(e.porRevisar));
  const c = Math.min(100, b + pct(e.enRetrabajo));
  return `conic-gradient(${VERDE} 0 ${a}%, ${AMBAR} ${a}% ${b}%, ${ROSA} ${b}% ${c}%, ${VACIO} ${c}% 100%)`;
}

function textoAnillo(e: EstacionPista, unidad: string): string {
  const partes = [`${e.etiqueta}: ${e.aprobadas} de ${e.meta} ${unidad} aprobadas`];
  if (e.porRevisar > 0) partes.push(`${e.porRevisar} por revisar`);
  if (e.enRetrabajo > 0) partes.push(`${e.enRetrabajo} en retrabajo`);
  if (e.estado === "sin_entregar") partes.push("sin entregar");
  return partes.join(", ");
}

function Anillo({ e }: { e: EstacionPista }) {
  const sinEntregar = e.estado === "sin_entregar";
  return (
    <span
      className="relative grid size-10 place-items-center rounded-full"
      style={sinEntregar ? { border: "2px dashed var(--color-slate-300)" } : { background: fondoAnillo(e) }}
    >
      <span
        className={`grid size-[2.125rem] place-items-center rounded-full bg-white text-[11px] font-bold tabular-nums ${
          e.estado === "aprobado" ? "text-emerald-600" : "text-slate-500"
        }`}
      >
        {e.estado === "aprobado" ? <IconoCheck className="h-4 w-4" /> : sinEntregar ? "" : `${e.aprobadas}/${e.meta}`}
      </span>
      {e.enRetrabajo > 0 ? (
        <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-rose-500 text-xs font-bold leading-none text-white">
          !
        </span>
      ) : (
        e.porRevisar > 0 && (
          <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-amber-400 text-[11px] font-bold leading-none text-amber-950">
            {e.porRevisar}
          </span>
        )
      )}
    </span>
  );
}

// La ruta en una línea, para el asistente: lo aprobado y el proceso que se revisa.
function RutaMini({ estaciones, actual }: { estaciones: EstacionPista[]; actual: string }) {
  return (
    <ol className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-xs" aria-label="Ruta del mueble">
      {estaciones.map((s, i) => {
        const esta = s.clave === actual;
        return (
          <li key={s.clave} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="h-px w-3 bg-slate-300" />}
            <span
              aria-current={esta ? "step" : undefined}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                esta
                  ? "bg-amber-100 font-semibold text-amber-900 ring-1 ring-inset ring-amber-400"
                  : s.estado === "aprobado"
                    ? "text-emerald-700"
                    : "text-slate-500"
              }`}
            >
              {s.estado === "aprobado" && !esta && <IconoCheck className="h-3 w-3" />}
              {s.etiqueta}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Lo de un proceso al tocar su anillo: sus partes (si se entregó por partes) y sus folios.
function Historial({ e, unidad, pedidoId }: { e: EstacionPista; unidad: string; pedidoId: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {e.partes.length > 0 && (
        <p className="mb-1">
          {e.partes.map((p, i) => (
            <span key={p.descripcion}>
              {i > 0 && ", "}
              {p.descripcion} <span className="tabular-nums">{p.aprobadas}/{p.meta} pz</span>
            </span>
          ))}
        </p>
      )}
      {e.informes.length === 0 ? (
        <p>{e.etiqueta}: todavía sin revisar.</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label={`Folios de ${e.etiqueta}`}>
          {e.informes.map((inf) => (
            <li key={inf.id}>
              <EnlaceFila
                href={`/calidad/pedidos/${pedidoId}/informe/${inf.id}`}
                className="inline-flex items-center gap-1.5 hover:underline max-md:py-1"
              >
                <span className={inf.aprobado ? "text-emerald-600" : "text-rose-600"}>
                  {inf.aprobado ? <IconoCheck className="h-3.5 w-3.5" /> : <IconoX className="h-3.5 w-3.5" />}
                </span>
                <span className="font-medium text-slate-800">{inf.folio}</span>
                <span>
                  {inf.aprobado ? "aprobó" : "no aprobó"}
                  {inf.cantidad !== null ? ` ${inf.cantidad} ${inf.parte ? "pz" : unidad}` : ""}
                  {inf.parte ? ` de ${inf.parte}` : ""} el {formatoFechaDMA(inf.elaborado_en)}
                </span>
              </EnlaceFila>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PistaProcesos({
  pista,
  unidad,
  pedidoId,
  puedeEvaluar,
}: {
  pista: PistaMueble;
  unidad: string;
  pedidoId: string;
  puedeEvaluar: boolean;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const seleccion = pista.estaciones.find((e) => e.clave === abierta) ?? null;
  const pendientes = pista.estaciones.flatMap((e) => e.pendientes.map((l) => ({ e, l })));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex w-full max-w-sm flex-col gap-2">
      <ol className="flex min-w-0 items-start" aria-label="Procesos del mueble">
        {pista.estaciones.map((e, i) => (
          <li key={e.clave} className="flex flex-1 items-start last:flex-none">
            <button
              type="button"
              onClick={() => setAbierta((v) => (v === e.clave ? null : e.clave))}
              aria-expanded={abierta === e.clave}
              aria-label={`${textoAnillo(e, unidad)}. Ver sus folios`}
              title={textoAnillo(e, unidad)}
              // Ancho fijo: con nombres largos las líneas entre anillos no se acortan.
              className={`flex w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-lg px-0.5 py-1 transition-colors hover:bg-slate-50 ${
                abierta === e.clave ? "bg-slate-50 ring-1 ring-inset ring-slate-200" : ""
              }`}
            >
              <Anillo e={e} />
              <span className="text-center text-[11px] font-medium leading-tight text-balance text-slate-600">
                {e.etiqueta}
              </span>
            </button>
            {i < pista.estaciones.length - 1 && (
              // A la altura del centro del anillo.
              <span
                aria-hidden
                className="mx-0.5 mt-[23px] h-0.5 min-w-2 flex-1 rounded-full"
                style={{ background: e.estado === "aprobado" ? VERDE : VACIO }}
              />
            )}
          </li>
        ))}
      </ol>

        {/* Lo que hay que revisar, debajo de la ruta, a la derecha (como "Asignar" en Producción). */}
        {puedeEvaluar && pendientes.length > 0 && (
          <div className="flex flex-col items-end gap-1.5">
            {pendientes.map(({ e, l }) => (
              <EvaluarLote
                key={l.entrega_id}
                lote={l}
                compacto
                contexto={<RutaMini estaciones={pista.estaciones} actual={e.clave} />}
              />
            ))}
          </div>
        )}
      </div>

      {seleccion && <Historial e={seleccion} unidad={unidad} pedidoId={pedidoId} />}

      {pista.sueltos.length > 0 && (
        <p className="text-xs text-slate-500">
          Folios anteriores:{" "}
          {pista.sueltos.map((inf, i) => (
            <span key={inf.id}>
              {i > 0 && ", "}
              <EnlaceFila
                href={`/calidad/pedidos/${pedidoId}/informe/${inf.id}`}
                className={`hover:underline ${inf.aprobado ? "text-emerald-700" : "text-rose-700"}`}
              >
                {inf.folio}
              </EnlaceFila>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
