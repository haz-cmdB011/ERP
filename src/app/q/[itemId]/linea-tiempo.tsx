import { formatoFechaHora, type EventoMueble, type TonoEvento } from "@/lib/trazabilidad/linea-tiempo-mueble";

const PUNTO: Record<TonoEvento, string> = {
  neutro: "bg-slate-300",
  bien: "bg-emerald-500",
  mal: "bg-rose-500",
  aviso: "bg-amber-500",
};

// Historial del mueble, lo más reciente arriba (ver lib/trazabilidad/linea-tiempo-mueble.ts).
// El color del punto acompaña al texto, nunca va solo.
export default function LineaTiempoMueble({ eventos }: { eventos: EventoMueble[] }) {
  if (eventos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
        Todavía no hay nada registrado de este mueble.
      </p>
    );
  }
  return (
    <ol className="flex flex-col">
      {eventos.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < eventos.length - 1 && (
            <span aria-hidden="true" className="absolute left-[5px] top-4 h-full w-px bg-slate-200" />
          )}
          <span aria-hidden="true" className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO[e.tono]}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{e.titulo}</p>
            {e.detalle && <p className="text-sm text-slate-600">{e.detalle}</p>}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
              <time dateTime={e.fecha}>{formatoFechaHora(e.fecha)}</time>
              {e.quien && <span>· {e.quien}</span>}
              {e.fotoUrl && (
                <a
                  href={e.fotoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-700 hover:underline"
                >
                  Ver foto
                </a>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
