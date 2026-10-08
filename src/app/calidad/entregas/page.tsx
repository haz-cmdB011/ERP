import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEvaluarCalidad } from "@/lib/auth/get-perfil";
import { cargarLotesPorEvaluar } from "@/lib/calidad/resumen-db";
import type { LoteCalidad } from "@/lib/calidad/lotes";
import { PROCESO_LABELS, diasEntre, formatoFecha, hoyMexico } from "@/lib/produccion/asignaciones";
import { formatoFechaDMA } from "@/lib/resumen/entrega";
import ChipEstado from "@/components/chip-estado";
import EstadoVacio from "@/components/estado-vacio";
import EvaluarLote from "../evaluar-lote";

export const metadata: Metadata = { title: "Lotes por evaluar" };

function Origen({ lote }: { lote: LoteCalidad }) {
  return lote.folio_rechazo ? (
    <ChipEstado tono="proceso">Retrabajo de {lote.folio_rechazo}</ChipEstado>
  ) : (
    <ChipEstado tono="neutro">Lote nuevo</ChipEstado>
  );
}

// Lotes que Producción entregó y verificó y que Calidad todavía no evalúa
// (completos o en parte). Cada lote se evalúa aquí mismo: cuántas piezas se
// aprueban y cuántas se rechazan. Los más antiguos van primero.
export default async function LotesPorEvaluarPage() {
  const supabase = await createClient();
  const [perfil, lista] = await Promise.all([getPerfilActual(supabase), cargarLotesPorEvaluar(supabase)]);
  const puedeEvaluar = puedeEvaluarCalidad(perfil);
  const hoy = hoyMexico();
  const espera = (l: LoteCalidad) => Math.max(0, diasEntre(hoyMexico(new Date(l.verificada_en)), hoy));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Lotes por evaluar</h1>
          <p className="mt-1 text-sm text-slate-500">
            Entregas de los equipos que Producción ya revisó. Indica cuántas piezas apruebas y cuántas rechazas; lo
            rechazado regresa a Producción como retrabajo. Los más antiguos van primero.
          </p>
        </div>
        {lista.length > 0 && (
          <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {lista.length} lote{lista.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {lista.length === 0 ? (
        <EstadoVacio
          titulo="No hay lotes por evaluar"
          descripcion="Cuando Producción verifique una entrega aparecerá aquí."
          accion={{ href: "/calidad", etiqueta: "Ir a Pedidos" }}
        />
      ) : (
        <>
          {/* Tarjetas (celular) */}
          <ul className="flex flex-col gap-3 md:hidden">
            {lista.map((l) => (
              <li key={l.entrega_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  {l.planeacion_item_id ? (
                    <Link
                      href={`/calidad/escanear/${l.planeacion_item_id}`}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {l.numero_pedido} · {l.modelo ?? `ítem ${l.item_code}`}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">
                      {l.numero_pedido} · {l.modelo ?? `ítem ${l.item_code}`}
                    </span>
                  )}
                  <Origen lote={l} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {l.equipo} · {PROCESO_LABELS[l.proceso]} · entregado el {formatoFecha(l.fecha_entrega)}
                </p>
                <p className="text-sm text-slate-600">
                  Por evaluar {l.pendiente} de {l.cantidad} {l.unidad ?? ""} · verificado el{" "}
                  {formatoFechaDMA(l.verificada_en)}
                </p>
                {puedeEvaluar && (
                  <div className="mt-3">
                    <EvaluarLote lote={l} />
                  </div>
                )}
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
                  <th className="px-4 py-3">Equipo</th>
                  <th className="px-4 py-3">Por evaluar</th>
                  <th className="px-4 py-3">Verificado</th>
                  <th className="px-4 py-3">Origen</th>
                  {puedeEvaluar && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((l) => {
                  const dias = espera(l);
                  return (
                    <tr key={l.entrega_id} className="align-top transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{l.numero_pedido}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {l.planeacion_item_id ? (
                          <Link
                            href={`/calidad/escanear/${l.planeacion_item_id}`}
                            className="hover:text-brand-700 hover:underline"
                          >
                            {l.modelo ?? "—"}
                          </Link>
                        ) : (
                          (l.modelo ?? "—")
                        )}{" "}
                        <span className="text-xs text-slate-500">· ítem {l.item_code}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {l.equipo}
                        <span className="block text-xs text-slate-500">
                          {PROCESO_LABELS[l.proceso]} · entregó {formatoFecha(l.fecha_entrega)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                        {l.pendiente} de {l.cantidad} {l.unidad ?? ""}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatoFechaDMA(l.verificada_en)}
                        {dias > 0 && (
                          <span className={`block text-xs ${dias >= 3 ? "font-medium text-amber-700" : "text-slate-500"}`}>
                            hace {dias} día{dias === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Origen lote={l} />
                      </td>
                      {puedeEvaluar && (
                        <td className="px-4 py-3 text-right">
                          <EvaluarLote lote={l} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
