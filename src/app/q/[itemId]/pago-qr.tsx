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

// Estimaciones desde el QR: los recibos que cobraron este mueble y si ya se pagaron, por
// área. Solo consulta (se revisan y pagan en su pantalla). Ver lib/trazabilidad/pago-maquilador.ts.
export default function PagoQr({
  cobros,
  pago,
  unidad,
}: {
  cobros: CobroMueble[];
  pago: ResumenPago & { porArea: Partial<Record<CobroMueble["area"], ResumenPago>> };
  unidad: string | null;
}) {
  const u = unidad ?? "pz";
  if (cobros.length === 0) {
    return <p className="text-sm text-slate-600">Ningún maquilador ha cobrado este mueble en un recibo.</p>;
  }
  return (
    <section aria-labelledby="pago-qr" className="flex flex-col gap-2">
      <h3 id="pago-qr" className="text-sm font-semibold text-slate-700">
        Recibos de este mueble
      </h3>
      <p className="flex flex-wrap gap-x-3 text-sm text-slate-600">
        {Object.entries(pago.porArea).map(([area, r]) => (
          <span key={area}>
            {AREA_PAGO_LABELS[area as CobroMueble["area"]]}: pagado {fmt(r.pagado)} de {fmt(r.cobrado)} {u}
          </span>
        ))}
      </p>
      <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {cobros.map((c) => (
          <li key={c.reciboId}>
            <Link href={hrefRecibo(c)} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50">
              <span className="min-w-0">
                <span className="font-mono text-xs font-medium text-slate-900">{c.folio}</span>{" "}
                <span className="text-slate-700">
                  {fmt(c.cantidad)} {u}
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
    </section>
  );
}
