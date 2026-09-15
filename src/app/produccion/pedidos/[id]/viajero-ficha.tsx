import { FASES_TALLER_COLUMNS, type FaseTaller } from "@/lib/planeacion/fases-taller";
import ViajeroQr from "./viajero-qr";

export interface ViajeroFichaPedido {
  numero_pedido: string;
  proyectos: { nombre: string; cliente: string } | null;
}

export interface ViajeroFichaItem {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  tipo_material: string | null;
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  acabados: string | null;
  observaciones: string | null;
  fases_taller: Partial<Record<FaseTaller, boolean>> | null;
}

export interface ViajeroFichaPadre {
  item_code: number;
  descripcion: string | null;
}

// Ficha individual de la Hoja de Viajero: la usan tanto la página de un solo
// ítem (viajero/[itemId]/page.tsx) como el reporte por lote
// (viajero-lote/page.tsx), para que ambas se mantengan idénticas sin
// duplicar el marcado.
export default function ViajeroFicha({
  pedido,
  item,
  padre,
}: {
  pedido: ViajeroFichaPedido;
  item: ViajeroFichaItem;
  padre: ViajeroFichaPadre | null;
}) {
  const fasesAplicables = FASES_TALLER_COLUMNS.filter(
    (fase) => item.fases_taller?.[fase] === true
  );

  return (
    <article className="flex flex-col gap-6">
      <header className="border-b border-gray-300 pb-3">
        <h1 className="text-lg font-semibold">Hoja de Viajero</h1>
        <p className="text-sm text-gray-700">
          {pedido.numero_pedido} — {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <p className="text-sm text-gray-700">
          Ítem {item.item_code}
          {item.modelo ? ` — ${item.modelo}` : ""}
        </p>
        {padre && (
          <p className="text-xs text-gray-500">
            Componente de Ítem {padre.item_code} — {padre.descripcion}
          </p>
        )}
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase text-gray-500">
          Detalle de fabricación
        </h2>
        {/* Precios/costos: intencionalmente omitidos, no forman parte del viajero de taller. */}
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">Descripción</dt>
          <dd>{item.descripcion}</dd>
          <dt className="text-gray-500">Cantidad a fabricar</dt>
          <dd>
            {item.cantidad_total} {item.unidad}
          </dd>
          <dt className="text-gray-500">Acabado</dt>
          <dd>{item.acabados ?? "—"}</dd>
          <dt className="text-gray-500">Material</dt>
          <dd>{item.tipo_material ?? "—"}</dd>
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-gray-500">Ruta de procesos</h2>
        {fasesAplicables.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            Sin fases de taller registradas para este ítem.
          </p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="w-10 py-1"></th>
                <th className="py-1">Fase</th>
                <th className="py-1">Firma / Fecha</th>
              </tr>
            </thead>
            <tbody>
              {fasesAplicables.map((fase) => (
                <tr key={fase} className="border-t border-gray-200">
                  <td className="py-2">
                    <span className="inline-block h-4 w-4 border border-gray-500" />
                  </td>
                  <td className="py-2 font-medium">{fase}</td>
                  <td className="py-2">
                    <span className="inline-block h-4 w-full border-b border-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-gray-500">Observaciones</h2>
        {item.observaciones && (
          <p className="mt-1 text-sm text-gray-700">{item.observaciones}</p>
        )}
        <div className="mt-2 h-20 rounded border border-dashed border-gray-400 p-2 text-xs text-gray-400">
          Notas del operario
        </div>
      </section>

      <section className="flex items-center justify-between border-t border-gray-300 pt-4">
        <p className="text-xs text-gray-500">Escanea para identificar este ítem en taller.</p>
        <ViajeroQr value={item.id} />
      </section>
    </article>
  );
}
