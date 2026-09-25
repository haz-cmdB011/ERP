import QrCode from "./qr-code";

export interface InformeFichaPedido {
  numero_pedido: string;
  fecha_pedido: string | null;
  fecha_entrega: string | null;
  proyectos: { nombre: string; cliente: string } | null;
}

export interface InformeFichaItem {
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
}

export interface InformeFichaInforme {
  folio: string;
  aprobado: boolean;
  descripcion: string | null;
  elaborado_en: string;
  elaboradoPorNombre: string | null;
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-300 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{valor}</span>
    </div>
  );
}

// Logotipo real de Mobiliarium, servido como archivo estático desde
// public/branding/ (no next/image: se captura como PDF vía html2canvas y
// necesita estar disponible de inmediato, sin lazy-loading).
function LogoMobiliarium() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- asset estático simple, no next/image
    <img src="/branding/mobiliarium-logo.png" alt="Mobiliarium — creating lifestyle" className="h-10" />
  );
}

// Ficha del Informe de Calidad: la usa la página del informe individual.
// Marcada con data-informe para que descargar-pdf-button.tsx la capture.
// Estilo "ficha técnica compacta": una sola columna angosta, tipo recibo,
// sin tarjetas ni fondos de color — pensada para imprimir rápido y ocupar
// menos espacio.
export default function InformeFicha({
  pedido,
  item,
  informe,
  imagenUrls = [],
  qrUrl,
  folioProduccion = null,
}: {
  pedido: InformeFichaPedido;
  item: InformeFichaItem;
  informe: InformeFichaInforme;
  imagenUrls?: string[];
  qrUrl: string;
  // Folio PRD-… del ítem (trazabilidad Producción → Calidad), si ya tiene.
  folioProduccion?: string | null;
}) {
  const fechaInforme = new Date(informe.elaborado_en).toLocaleString("es-MX");

  return (
    <article data-informe className="mx-auto flex w-full max-w-sm flex-col gap-3 bg-white p-4">
      <header className="flex flex-col items-center gap-2 text-center">
        <LogoMobiliarium />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Informe de Calidad
          </p>
          <h1 className="text-base font-bold tracking-tight text-slate-900">
            {pedido.numero_pedido}
          </h1>
          <p className="text-xs text-slate-500">Folio {informe.folio}</p>
        </div>
      </header>

      <div className="flex flex-col items-center gap-1 border-y border-dashed border-slate-300 py-3">
        <QrCode value={qrUrl} size={72} />
        <p className="text-center text-[9px] text-slate-400">Escanea para rastrear este informe</p>
      </div>

      <p
        className={`text-center text-sm font-bold tracking-widest ${
          informe.aprobado ? "text-emerald-700" : "text-rose-700"
        }`}
      >
        {informe.aprobado ? "APROBADO" : "NO APROBADO"}
      </p>

      {imagenUrls.length > 0 && (
        // eslint-disable-next-line @next/next/no-img-element -- imagen en bucket privado vía signed URL, no next/image
        <img
          src={imagenUrls[0]}
          alt={`Imagen del ítem ${item.item_code}`}
          className="mx-auto h-40 w-40 border border-slate-200 object-contain"
        />
      )}

      <div className="flex flex-col">
        <Campo label="Ítem" valor={`${item.item_code}${item.modelo ? ` — ${item.modelo}` : ""}`} />
        {folioProduccion && <Campo label="Folio producción" valor={folioProduccion} />}
        <Campo label="No. Pedido" valor={pedido.numero_pedido} />
        <Campo label="Cliente" valor={pedido.proyectos?.cliente ?? "—"} />
        <Campo label="Proyecto" valor={pedido.proyectos?.nombre ?? "—"} />
        <Campo label="Fecha inicio" valor={pedido.fecha_pedido ?? "—"} />
        <Campo label="Fecha término" valor={pedido.fecha_entrega ?? "—"} />
        <Campo label="Fecha del informe" valor={fechaInforme} />
        <Campo label="Elaboró" valor={informe.elaboradoPorNombre ?? "—"} />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Descripción del ítem
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">{item.descripcion}</p>
      </div>

      {informe.descripcion && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Hallazgos / Observaciones de calidad
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">{informe.descripcion}</p>
        </div>
      )}

      {/* Un informe "No aprobado" no lleva firmas (ni en pantalla, ni al
          imprimir, ni en el PDF): solo el aprobado se firma. */}
      {informe.aprobado && (
        <div className="mt-2 flex flex-col gap-4 border-t border-dashed border-slate-300 pt-3">
          <div>
            <div className="h-8 border-b border-slate-400" />
            <p className="mt-1 text-center text-[9px] text-slate-500">
              Firma de quien elaboró el informe
            </p>
          </div>
          <div>
            <div className="h-8 border-b border-slate-400" />
            <p className="mt-1 text-center text-[9px] text-slate-500">
              Firma de quien fabricó el ítem
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
