import type { FaseTaller } from "@/lib/planeacion/fases-taller";
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
  qrUrl,
  imagenUrls = [],
}: {
  pedido: ViajeroFichaPedido;
  item: ViajeroFichaItem;
  padre: ViajeroFichaPadre | null;
  // URL absoluta a la Hoja de Viajero de este ítem: lo que debe codificar
  // el QR para que escanearlo abra la página, en vez de solo mostrar texto.
  qrUrl: string;
  // URLs firmadas (bucket privado) de las imágenes que trae el ítem en el
  // Excel original, si tiene alguna.
  imagenUrls?: string[];
}) {
  // Locale explícito: el servidor de producción no necesariamente usa la
  // misma configuración regional que un entorno de desarrollo local.
  const generadoEn = new Date().toLocaleString("es-MX");

  return (
    <article data-viajero-ficha className="flex flex-col gap-6 bg-white p-2">
      <header className="flex items-start justify-between gap-4 border-b border-gray-300 pb-3">
        <div>
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
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <ViajeroQr value={qrUrl} size={90} />
          <p className="max-w-[90px] text-center text-[10px] text-gray-500">
            Escanea para abrir esta hoja en el celular
          </p>
        </div>
      </header>

      <section className="flex flex-row items-start gap-4">
        {imagenUrls.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-3">
            {imagenUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element -- imagen en bucket privado vía signed URL, no next/image
              <img
                key={url}
                src={url}
                alt={`Imagen del ítem ${item.item_code}`}
                className="h-80 w-80 rounded border border-gray-200 object-contain print:h-72 print:w-72"
              />
            ))}
          </div>
        )}
        <div className="flex-1">
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
        </div>
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

      <footer className="border-t border-gray-300 pt-2 text-left text-xs text-gray-400">
        Generado: {generadoEn}
      </footer>
    </article>
  );
}
