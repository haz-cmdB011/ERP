"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { semanaDe, type Incidencia } from "@/lib/calidad/incidencias";
import { diaCorto } from "./formato";
import FormularioReporte, { type OpcionesFormulario } from "./formulario-reporte";

// Tabla de reportes con sus acciones: Editar (abre el formulario) y Cerrar (un
// toque, para lo abierto). Con `mostrarDias` agrega los días que lleva abierto.
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
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Fecha</th>
              {mostrarDias && <th className="px-3 py-2 text-right font-semibold">Días</th>}
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2 font-semibold">Auditó</th>
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold">Proyecto</th>
              <th className="px-3 py-2 font-semibold">Muebles</th>
              <th className="px-3 py-2 font-semibold">Áreas</th>
              <th className="px-3 py-2 font-semibold">Motivo</th>
              <th className="px-3 py-2 font-semibold">Reporta</th>
              <th className="px-3 py-2 font-semibold">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((i) => (
              <tr key={i.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                  {i.fecha ? diaCorto(i.fecha) : "—"}
                  {i.fecha && <span className="block text-xs text-slate-400">Sem {semanaDe(i.fecha)?.numero}</span>}
                </td>
                {mostrarDias && (
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">{i.dias ?? "—"}</td>
                )}
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      i.estado === "abierto"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {i.estado === "abierto" ? "Abierto" : "Cerrado"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{i.auditor ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{i.tipo}</td>
                <td className="px-3 py-2 text-slate-700">{i.proyecto ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{i.muebles.join(", ") || "—"}</td>
                <td className="px-3 py-2 text-slate-700">{i.areas.join(", ") || "—"}</td>
                <td className="px-3 py-2 text-slate-700">
                  {i.motivo ?? "—"}
                  <span className="block text-xs text-slate-400">{i.categoria_motivo}</span>
                </td>
                <td className="px-3 py-2 text-slate-700">{i.areas_reporta.join(", ") || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => setEditando(i)} className={boton}>
                      Editar
                    </button>
                    {i.estado === "abierto" && (
                      <button type="button" onClick={() => cerrar(i)} disabled={cerrando === i.id} className={boton}>
                        {cerrando === i.id ? "Cerrando…" : "Cerrar"}
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editando && (
        <FormularioReporte inicial={editando} opciones={opciones} hoy={hoy} onCerrar={() => setEditando(null)} />
      )}
    </>
  );
}
