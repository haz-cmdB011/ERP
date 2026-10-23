"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { semanaDe, type Incidencia } from "@/lib/calidad/incidencias";
import { diaCorto } from "./formato";
import FormularioReporte, { type OpcionesFormulario } from "./formulario-reporte";
import VisorReporte from "./visor-reporte";

// Ancho de cada columna (en %) cuando la tabla ocupa todo el ancho: fecha, [días], estado, auditó,
// tipo, proyecto, muebles, áreas, motivo, reporta y acciones. Cada lista suma 100.
const ANCHOS_SIN_DIAS = [7, 7, 9, 9, 13, 11, 11, 15, 9, 9];
const ANCHOS_CON_DIAS = [7, 5, 7, 9, 9, 12, 10, 10, 13, 9, 9];

// Tabla de reportes con sus acciones: Ver reporte (abre el PDF del reporte a pantalla completa),
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
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        {/* En pantallas anchas la tabla se reparte en el ancho disponible (columnas fijas y texto que
            baja de renglón), así se ven todas las columnas y los botones sin desplazador. En pantallas
            angostas conserva un ancho mínimo y se desplaza de lado. */}
        <table className="w-full min-w-[56rem] text-left text-sm lg:min-w-0 lg:table-fixed lg:text-xs">
          <colgroup className="hidden lg:table-column-group">
            {(mostrarDias ? ANCHOS_CON_DIAS : ANCHOS_SIN_DIAS).map((ancho, n) => (
              <col key={n} style={{ width: `${ancho}%` }} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 font-semibold">Fecha</th>
              {mostrarDias && <th className="px-2 py-2 text-right font-semibold">Días</th>}
              <th className="px-2 py-2 font-semibold">Estado</th>
              <th className="px-2 py-2 font-semibold">Auditó</th>
              <th className="px-2 py-2 font-semibold">Tipo</th>
              <th className="px-2 py-2 font-semibold">Proyecto</th>
              <th className="px-2 py-2 font-semibold">Muebles</th>
              <th className="px-2 py-2 font-semibold">Áreas</th>
              <th className="px-2 py-2 font-semibold">Motivo</th>
              <th className="px-2 py-2 font-semibold">Reporta</th>
              <th className="px-2 py-2 font-semibold">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((i) => (
              <tr key={i.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-2 py-2 text-slate-700">
                  {i.fecha ? diaCorto(i.fecha) : "—"}
                  {i.fecha && <span className="block text-xs text-slate-500">Sem {semanaDe(i.fecha)?.numero}</span>}
                </td>
                {mostrarDias && (
                  <td className="px-2 py-2 text-right tabular-nums text-amber-700">{i.dias ?? "—"}</td>
                )}
                <td className="px-2 py-2">
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
                <td className="px-2 py-2 text-slate-700">{i.auditor ?? "—"}</td>
                <td className="px-2 py-2 text-slate-700">{i.tipo}</td>
                <td className="px-2 py-2 text-slate-700">{i.proyecto ?? "—"}</td>
                <td className="px-2 py-2 text-slate-700">{i.muebles.join(", ") || "—"}</td>
                <td className="px-2 py-2 text-slate-700">{i.areas.join(", ") || "—"}</td>
                <td className="px-2 py-2 text-slate-700">
                  {i.motivo ?? "—"}
                  <span className="block text-xs text-slate-500">{i.categoria_motivo}</span>
                </td>
                <td className="px-2 py-2 text-slate-700">{i.areas_reporta.join(", ") || "—"}</td>
                <td className="px-2 py-2">
                  <span className="flex flex-col items-stretch gap-1.5">
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
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

