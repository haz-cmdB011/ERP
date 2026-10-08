import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarEntregasConInforme } from "@/lib/calidad/resumen-db";
import { MOTIVO_NOMBRE, porInspeccionar, type MotivoInspeccion } from "@/lib/calidad/inspeccion";
import { formatoFechaDMA } from "@/lib/resumen/entrega";
import ChipEstado from "@/components/chip-estado";
import EstadoVacio from "@/components/estado-vacio";

export const metadata: Metadata = { title: "Entregas por inspeccionar" };

const TONO: Record<MotivoInspeccion, "alerta" | "proceso" | "neutro"> = {
  sin_evaluar: "alerta",
  reinspeccion: "proceso",
  entrega_nueva: "neutro",
};

// Lo que Producción ya entregó y Calidad todavía no inspecciona (o tiene que
// volver a inspeccionar). Cada fila abre el mueble para evaluarlo.
export default async function EntregasPorInspeccionarPage() {
  const supabase = await createClient();
  const { entregas, ultimoInforme } = await cargarEntregasConInforme(supabase);
  const lista = porInspeccionar(entregas, ultimoInforme);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Entregas por inspeccionar</h1>
          <p className="mt-1 text-sm text-slate-500">
            Muebles que Producción ya entregó y revisó, y que no tienen evaluación al día. Los más antiguos van primero.
          </p>
        </div>
        {lista.length > 0 && (
          <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {lista.length} mueble{lista.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {lista.length === 0 ? (
        <EstadoVacio
          titulo="Todo lo entregado está inspeccionado"
          descripcion="Cuando Producción entregue algo nuevo aparecerá aquí."
          accion={{ href: "/calidad", etiqueta: "Ir a Pedidos" }}
        />
      ) : (
        <>
          {/* Tarjetas (celular) */}
          <ul className="flex flex-col gap-3 md:hidden">
            {lista.map((e) => (
              <li key={e.itemId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/calidad/escanear/${e.itemId}`}
                    className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                  >
                    {e.numeroPedido} · {e.modelo ?? `ítem ${e.itemCode}`}
                  </Link>
                  <ChipEstado tono={TONO[e.motivo]}>{MOTIVO_NOMBRE[e.motivo]}</ChipEstado>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Entregadas {e.entregado} de {e.asignado} {e.unidad ?? ""} · última entrega{" "}
                  {formatoFechaDMA(e.ultimaEntrega)}
                </p>
                <Link
                  href={`/calidad/escanear/${e.itemId}`}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-on-brand hover:bg-brand-400"
                >
                  Evaluar
                </Link>
              </li>
            ))}
          </ul>

          {/* Tabla (pantallas anchas) */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">PM</th>
                  <th className="px-4 py-3">Mueble</th>
                  <th className="px-4 py-3">Entregado</th>
                  <th className="px-4 py-3">Última entrega</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((e) => (
                  <tr key={e.itemId} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{e.numeroPedido}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {e.modelo ?? "—"} <span className="text-xs text-slate-500">· ítem {e.itemCode}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                      {e.entregado} de {e.asignado} {e.unidad ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatoFechaDMA(e.ultimaEntrega)}</td>
                    <td className="px-4 py-3">
                      <ChipEstado tono={TONO[e.motivo]}>{MOTIVO_NOMBRE[e.motivo]}</ChipEstado>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/calidad/escanear/${e.itemId}`}
                        className="rounded bg-brand-500 px-2.5 py-1 text-xs font-semibold text-on-brand hover:bg-brand-400"
                      >
                        Evaluar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
