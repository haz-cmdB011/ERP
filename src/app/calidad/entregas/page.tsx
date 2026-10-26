import type { Metadata } from "next";
import PestanasSeccion from "@/app/calidad/pestanas-seccion";
import EnlaceFila from "@/components/enlace-fila";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEvaluarCalidad } from "@/lib/auth/get-perfil";
import { cargarLotesPorEvaluar } from "@/lib/calidad/resumen-db";
import type { LoteCalidad } from "@/lib/calidad/lotes";
import { etiquetaProceso, formatoFecha } from "@/lib/produccion/asignaciones";
import { formatoFechaDMA } from "@/lib/resumen/entrega";
import ChipEstado from "@/components/chip-estado";
import EstadoVacio from "@/components/estado-vacio";
import EvaluarLote from "../evaluar-lote";

export const metadata: Metadata = { title: "Entregas de Producción" };

function Origen({ lote }: { lote: LoteCalidad }) {
  return lote.folio_rechazo ? (
    <ChipEstado tono="proceso">Retrabajo de {lote.folio_rechazo}</ChipEstado>
  ) : (
    <ChipEstado tono="neutro">Primera entrega</ChipEstado>
  );
}

// Entregas que Producción verificó y que Calidad todavía no revisa (completas o
// en parte), identificadas por su fecha. Revisarlas es OPCIONAL: Calidad revisa
// el mueble completo en la revisión final y entra a una entrega solo si ve una
// falla en ese proceso. Por eso no hay alerta de días. Las más antiguas primero.
export default async function EntregasProduccionPage() {
  const supabase = await createClient();
  const [perfil, lista] = await Promise.all([getPerfilActual(supabase), cargarLotesPorEvaluar(supabase)]);
  const puedeEvaluar = puedeEvaluarCalidad(perfil);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PestanasSeccion seccion="revision" />
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Entregas de Producción</h1>
          <p className="mt-1 text-sm text-slate-600">
            Lo que Producción ya verificó, por fecha de entrega. Revisarlas aquí es opcional: úsalo si encuentras
            una falla en un proceso. El mueble completo se revisa en la revisión final.
          </p>
        </div>
        {lista.length > 0 && (
          <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {lista.length} entrega{lista.length === 1 ? "" : "s"} sin revisar
          </span>
        )}
      </div>

      {lista.length === 0 ? (
        <EstadoVacio
          titulo="No hay entregas sin revisar"
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
                    <EnlaceFila
                      href={`/calidad/escanear/${l.planeacion_item_id}`}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {l.numero_pedido} · {l.modelo ?? `ítem ${l.item_code}`}
                    </EnlaceFila>
                  ) : (
                    <span className="font-medium text-slate-900">
                      {l.numero_pedido} · {l.modelo ?? `ítem ${l.item_code}`}
                    </span>
                  )}
                  <Origen lote={l} />
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  Entregada el {formatoFecha(l.fecha_entrega)}
                </p>
                <p className="text-sm text-slate-600">
                  {etiquetaProceso(l)} · {l.equipo}
                  {l.folio_hoja ? ` · hoja ${l.folio_hoja}` : ""}
                </p>
                <p className="text-sm text-slate-600">
                  Sin revisar {l.pendiente} de {l.cantidad} {l.unidad ?? ""} · verificada el{" "}
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
                  <th className="px-4 py-3">Entregada</th>
                  <th className="px-4 py-3">PM</th>
                  <th className="px-4 py-3">Mueble</th>
                  <th className="px-4 py-3">Proceso y equipo</th>
                  <th className="px-4 py-3">Sin revisar</th>
                  <th className="px-4 py-3">Verificada</th>
                  <th className="px-4 py-3">Origen</th>
                  {puedeEvaluar && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((l) => {
                  return (
                    <tr key={l.entrega_id} className="align-top transition-colors hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {formatoFecha(l.fecha_entrega)}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{l.numero_pedido}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {l.planeacion_item_id ? (
                          <EnlaceFila
                            href={`/calidad/escanear/${l.planeacion_item_id}`}
                            className="hover:text-brand-700 hover:underline"
                          >
                            {l.modelo ?? "—"}
                          </EnlaceFila>
                        ) : (
                          (l.modelo ?? "—")
                        )}{" "}
                        <span className="text-xs text-slate-500">· ítem {l.item_code}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {etiquetaProceso(l)}
                        <span className="block text-xs text-slate-500">{l.equipo}</span>
                        {l.folio_hoja && (
                          <span className="block text-xs text-slate-500">Hoja: {l.folio_hoja}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                        {l.pendiente} de {l.cantidad} {l.unidad ?? ""}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatoFechaDMA(l.verificada_en)}
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
