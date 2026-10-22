import Link from "next/link";
import ChipEstado, { type TonoChip } from "@/components/chip-estado";
import { formatoFecha } from "@/lib/produccion/asignaciones";
import {
  AREA_PAGO_LABELS,
  hrefRecibo,
  type CobroMueble,
  type EstadoRecibo,
  type ResumenPago,
} from "@/lib/trazabilidad/pago-maquilador";

const ESTADO_RECIBO: Record<EstadoRecibo, { tono: TonoChip; texto: string }> = {
  pendiente: { tono: "neutro", texto: "Pendiente" },
  revisado: { tono: "proceso", texto: "Revisado" },
  pagado: { tono: "ok", texto: "Pagado" },
  cancelado: { tono: "neutro", texto: "Cancelado" },
};

const fmt = (n: number) => String(Math.round(n * 100) / 100);

// Cuántos recibos se ven sin abrir "Ver todos".
const VISIBLES = 3;

function Recibos({ cobros, unidad }: { cobros: CobroMueble[]; unidad: string }) {
  return (
    <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {cobros.map((c) => (
        <li key={c.reciboId}>
          <Link href={hrefRecibo(c)} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50">
            <span className="min-w-0">
              <span className="font-mono text-xs font-medium text-slate-900">{c.folio}</span>{" "}
              <span className="text-slate-700">
                {fmt(c.cantidad)} {unidad}
                {c.reproceso > 0 ? ` + ${fmt(c.reproceso)} reproceso` : ""}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {AREA_PAGO_LABELS[c.area]} · {c.contratista ?? "—"}
                {c.pagado_en ? ` · pagado el ${formatoFecha(c.pagado_en)}` : ""}
              </span>
            </span>
            <ChipEstado tono={ESTADO_RECIBO[c.estado].tono}>{ESTADO_RECIBO[c.estado].texto}</ChipEstado>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Estimaciones en la ficha del QR: los recibos que cobraron este mueble, del más reciente
// al más antiguo, con su estado. Solo consulta (se revisan y pagan en su pantalla); el
// total pagado lo dice la línea de ayuda de la pestaña. Ver lib/trazabilidad/pago-maquilador.ts.
export default function PagoQr({
  cobros,
  pago,
  unidad,
}: {
  cobros: CobroMueble[];
  pago: ResumenPago & { porArea: Partial<Record<CobroMueble["area"], ResumenPago>> };
  unidad: string | null;
}) {
  if (cobros.length === 0) return null;
  const u = unidad ?? "pz";
  const recientes = [...cobros].reverse();
  const areas = Object.entries(pago.porArea);
  return (
    <div className="flex flex-col gap-2">
      {/* Con una sola área el total de la ayuda ya lo dice todo. */}
      {areas.length > 1 && (
        <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
          {areas.map(([area, r]) => (
            <span key={area}>
              {AREA_PAGO_LABELS[area as CobroMueble["area"]]}: {fmt(r.pagado)} de {fmt(r.cobrado)} pagadas
            </span>
          ))}
        </p>
      )}
      <Recibos cobros={recientes.slice(0, VISIBLES)} unidad={u} />
      {recientes.length > VISIBLES && (
        <details className="group flex flex-col gap-2">
          <summary className="cursor-pointer list-none text-sm font-medium text-brand-700 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Ver todos los recibos ({recientes.length - VISIBLES} más)</span>
            <span className="hidden group-open:inline">Ocultar los anteriores</span>
          </summary>
          <div className="mt-2">
            <Recibos cobros={recientes.slice(VISIBLES)} unidad={u} />
          </div>
        </details>
      )}
    </div>
  );
}
