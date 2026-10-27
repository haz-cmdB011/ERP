"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { semanaDe, type Incidencia } from "@/lib/calidad/incidencias";
import { diaCorto } from "./formato";
import FormularioReporte, { type OpcionesFormulario } from "./formulario-reporte";
import VisorReporte from "./visor-reporte";

// Color de lo que lleva abierto, por los mismos rangos de antigüedad que los Pendientes
// (31-60, 61-90, 91-180 y más de 180 días).
function tonoAntiguedad(dias: number | undefined): { borde: string; chip: string } {
  if (dias === undefined) return { borde: "border-slate-200", chip: "text-amber-700" };
  if (dias > 180) return { borde: "border-l-4 border-l-rose-800", chip: "border-rose-300 bg-rose-100 text-rose-900" };
  if (dias > 90) return { borde: "border-l-4 border-l-rose-500", chip: "border-rose-200 bg-rose-50 text-rose-700" };
  if (dias > 60) return { borde: "border-l-4 border-l-orange-500", chip: "border-orange-200 bg-orange-50 text-orange-700" };
  return { borde: "border-l-4 border-l-amber-400", chip: "border-amber-200 bg-amber-50 text-amber-700" };
}

// Reportes en tarjetas, cada una con sus acciones: Ver reporte (abre el PDF del reporte a pantalla completa),
// Editar (abre el formulario) y Cerrar (un toque, para lo abierto). Con `mostrarDias` agrega los
// días que lleva abierto.
export default function TablaReportes({
  filas,
  opciones,
  hoy,
  mostrarDias = false,
}: {
  filas: Array<Incidencia & { dias?: number }>;
  opciones: OpcionesFormulario;
  hoy: string;
  mostrarDias?: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Incidencia | null>(null);
  const [cerrando, setCerrando] = useState<string | null>(null);
  // El reporte que se está viendo en PDF a pantalla completa.
  const [viendo, setViendo] = useState<Incidencia | null>(null);

  async function cerrar(i: Incidencia) {
    setCerrando(i.id);
    const { data, error } = await createClient()
      .from("incidencias_calidad")
      .update({ estado: "cerrado" })
      .eq("id", i.id)
      .select("id");
    setCerrando(null);
    if (error || !data || data.length === 0) {
      avisar(error?.message ?? "No se pudo cerrar: no tienes permiso o el reporte ya no existe.", "error");
      return;
    }
    avisar("Reporte cerrado.", "exito");
    router.refresh();
  }

  const boton =
    "rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 max-md:min-h-9";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filas.map((i) => {
          const tono = mostrarDias ? tonoAntiguedad(i.dias) : null;
          return (
            <article
              key={i.id}
              className={`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${tono?.borde ?? ""}`}
            >
              <header className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    i.estado === "abierto"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {i.estado === "abierto" ? "Abierto" : "Cerrado"}
                </span>
                <span className="text-sm text-slate-700">
                  {i.fecha ? diaCorto(i.fecha) : "Sin fecha"}
                  {i.fecha && <span className="text-xs text-slate-500"> · Sem {semanaDe(i.fecha)?.numero}</span>}
                </span>
                {mostrarDias && (
                  <span
                    className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${tono?.chip ?? ""}`}
                  >
                    {i.dias ?? "—"} días abierto
                  </span>
                )}
              </header>
              <div>
                <h3 className="font-semibold text-slate-900">{i.proyecto ?? "Sin proyecto"}</h3>
                <p className="text-sm text-slate-700">
                  {i.motivo ?? "—"}
                  {i.categoria_motivo && <span className="text-xs text-slate-500"> · {i.categoria_motivo}</span>}
                </p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {[
                  ["Tipo", i.tipo],
                  ["Auditó", i.auditor],
                  ["Muebles", i.muebles.join(", ")],
                  ["Áreas", i.areas.join(", ")],
                  ["Reporta", i.areas_reporta.join(", ")],
                ].map(([etiqueta, valor]) => (
                  <div key={etiqueta} className="contents">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{etiqueta}</dt>
                    <dd className="text-slate-700">{valor || "—"}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                <button type="button" onClick={() => setViendo(i)} className={boton}>
                  Ver reporte
                </button>
                <button type="button" onClick={() => setEditando(i)} className={boton}>
                  Editar
                </button>
                {i.estado === "abierto" && (
                  <button type="button" onClick={() => cerrar(i)} disabled={cerrando === i.id} className={boton}>
                    {cerrando === i.id ? "Cerrando…" : "Cerrar"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {viendo && (
        <VisorReporte
          incidencia={viendo}
          onCerrar={() => setViendo(null)}
          onEditar={() => {
            setEditando(viendo);
            setViendo(null);
          }}
        />
      )}
      {editando && (
        <FormularioReporte inicial={editando} opciones={opciones} hoy={hoy} onCerrar={() => setEditando(null)} />
      )}
    </>
  );
}

