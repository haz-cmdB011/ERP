import { PROCESO_LABELS, PROCESOS } from "@/lib/produccion/asignaciones";
import type { LineaTiempo } from "@/lib/planeacion/linea-tiempo";

interface Linea {
  etiqueta: string;
  hecho: number;
  total: number;
}

interface Paso {
  titulo: string;
  lineas: Linea[];
  // Texto cuando todavía no se puede avanzar en este paso.
  vacio?: string;
}

function Barra({ hecho, total }: { hecho: number; total: number }) {
  const porcentaje = total > 0 ? Math.round((hecho / total) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={porcentaje}
      className="h-1.5 overflow-hidden rounded-full bg-slate-100"
    >
      <div
        className={`h-full rounded-full ${porcentaje === 100 ? "bg-emerald-500" : "bg-brand-500"}`}
        style={{ width: `${porcentaje}%` }}
      />
    </div>
  );
}

// Seguimiento del PM de punta a punta (versión activa): qué parte ya se liberó a
// Producción, se asignó a equipos, se entregó y evaluó Calidad. Ver
// lib/planeacion/linea-tiempo.ts para cómo se cuenta cada paso.
export default function LineaTiempoPm({ tiempo: t }: { tiempo: LineaTiempo }) {
  const sinLiberar = t.mueblesLiberados === 0;
  const pasos: Paso[] = [
    {
      titulo: "Planeado",
      lineas: [
        { etiqueta: `Muebles: ${t.muebles}`, hecho: 1, total: 1 },
        { etiqueta: `Componentes: ${t.componentes}`, hecho: 1, total: 1 },
      ],
    },
    {
      titulo: "Liberado a Producción",
      lineas: [{ etiqueta: `Ítems: ${t.itemsLiberados} de ${t.itemsVigentes}`, hecho: t.itemsLiberados, total: t.itemsVigentes }],
    },
    {
      titulo: "Asignado a equipos",
      vacio: sinLiberar ? "Aún no hay muebles liberados." : undefined,
      lineas: PROCESOS.map((p) => ({
        etiqueta: `${PROCESO_LABELS[p]}: ${t.asignados[p]} de ${t.mueblesLiberados}`,
        hecho: t.asignados[p],
        total: t.mueblesLiberados,
      })),
    },
    {
      titulo: "Entregado",
      vacio: sinLiberar ? "Aún no hay muebles liberados." : undefined,
      lineas: PROCESOS.map((p) => ({
        etiqueta: `${PROCESO_LABELS[p]}: ${t.entregados[p]} de ${t.mueblesLiberados}`,
        hecho: t.entregados[p],
        total: t.mueblesLiberados,
      })),
    },
    {
      titulo: "Evaluado por Calidad",
      vacio: t.itemsLiberados === 0 ? "Aún no hay ítems liberados." : undefined,
      lineas: [{ etiqueta: `Ítems: ${t.evaluados} de ${t.itemsLiberados}`, hecho: t.evaluados, total: t.itemsLiberados }],
    },
  ];

  return (
    <section aria-label="Seguimiento del PM" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-slate-600">Seguimiento (versión activa)</h2>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {pasos.map((paso, i) => (
          <li key={paso.titulo} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-600">
                {i + 1}
              </span>
              {paso.titulo}
            </p>
            {paso.vacio ? (
              <p className="text-xs text-slate-400">{paso.vacio}</p>
            ) : (
              paso.lineas.map((l) => (
                <div key={l.etiqueta} className="flex flex-col gap-1">
                  <span className="text-xs text-slate-700">{l.etiqueta}</span>
                  {i > 0 && <Barra hecho={l.hecho} total={l.total} />}
                </div>
              ))
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
