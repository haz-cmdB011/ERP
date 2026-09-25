import type { ReciboElectrificacionGuardado } from "@/lib/estimaciones/recibos-electrificacion-db";
import { ESTADO_NOMBRE } from "@/lib/estimaciones/recibos-db";
import { BANDA_NOMBRE, money } from "@/lib/estimaciones/motor-precio";
import type { Banda } from "@/lib/estimaciones/motor-precio";
import { CATEGORIA_NOMBRE, COMPLEJIDAD_NOMBRE } from "@/lib/estimaciones/motor-electrificacion";
import QrCode from "../acabados/qr-code";

const BANDA_COLOR: Record<Banda, string> = {
  auto: "text-emerald-700",
  estimador: "text-amber-700",
  justificar: "text-rose-700",
};

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-300 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{valor}</span>
    </div>
  );
}

// Ficha imprimible del recibo de Electrificación: misma estructura que la de
// Acabados (encabezado, QR, datos del recibo, renglones, firmas), con el
// desglose de LED y kit de charolas en lugar de familia/cantidad.
export default function ReciboFichaElectrificacion({
  recibo,
  qrUrl,
  mostrarInterno = true,
}: {
  recibo: ReciboElectrificacionGuardado;
  qrUrl: string;
  // false para el maquilador: no ve las justificaciones internas.
  mostrarInterno?: boolean;
}) {
  const totalPropuesto = recibo.renglones.reduce((s, r) => s + r.cantidad * r.propuesto, 0);
  const totalAceptado = recibo.renglones.reduce((s, r) => s + r.importe, 0);
  const guardadoEn = new Date(recibo.guardadoEn).toLocaleString("es-MX");

  return (
    <article data-informe className="mx-auto flex w-full max-w-xl flex-col gap-3 bg-white p-4">
      <header className="flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset estático simple, no next/image */}
        <img src="/branding/mobiliarium-logo.png" alt="Mobiliarium — creating lifestyle" className="h-10" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Recibo de Maquila — Electrificación
          </p>
          <h1 className="text-base font-bold tracking-tight text-slate-900">Folio {recibo.folio}</h1>
        </div>
      </header>

      <div className="flex flex-col items-center gap-1 border-y border-dashed border-slate-300 py-3">
        <QrCode value={qrUrl} size={72} />
        <p className="text-center text-[9px] text-slate-400">Escanea para dar seguimiento a este recibo</p>
      </div>

      <div className="flex flex-col">
        <Campo label="Contratista" valor={recibo.contratista || "—"} />
        <Campo label="Obra" valor={recibo.obra || "—"} />
        <Campo label="OT" valor={recibo.ot || "—"} />
        <Campo label="Fecha del recibo" valor={recibo.fecha || "—"} />
        <Campo
          label="Prioridad"
          valor={recibo.prioridad === "normal" ? "Normal" : `${recibo.prioridad} — ${recibo.motivo}`}
        />
        {recibo.estado && <Campo label="Estado" valor={ESTADO_NOMBRE[recibo.estado]} />}
        <Campo label="Guardado" valor={guardadoEn} />
      </div>

      <table className="w-full border-collapse text-left text-[10px]">
        <thead>
          <tr className="border-b border-slate-300 text-slate-500">
            <th className="py-1 pr-1">#</th>
            <th className="py-1 pr-1">Modelo</th>
            <th className="py-1 pr-1 text-right">Cant.</th>
            <th className="py-1 pr-1">LED / pz</th>
            <th className="py-1 pr-1">Charolas / pz</th>
            <th className="py-1 pr-1 text-right">Prop. / pz</th>
            <th className="py-1 pr-1 text-right">Acep. / pz</th>
            <th className="py-1 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {recibo.renglones.map((r) => (
            <tr key={r.numero} className="border-b border-slate-100 align-top">
              <td className="py-1 pr-1 font-mono">{r.numero}</td>
              <td className="py-1 pr-1 font-mono">{r.modelo}</td>
              <td className="py-1 pr-1 text-right">{r.cantidad}</td>
              <td className="py-1 pr-1">
                {r.metrosLed > 0
                  ? `${r.metrosLed} m · ${r.complejidadLed ? COMPLEJIDAD_NOMBRE[r.complejidadLed] : "—"}`
                  : "—"}
              </td>
              <td className="py-1 pr-1">
                {r.charolas.length ? (
                  <ul>
                    {r.charolas.map((c) => (
                      <li key={c.numero}>
                        C{c.numero}: {c.drivers} drv · {CATEGORIA_NOMBRE[c.categoria]}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-1 pr-1 text-right">{money(r.propuesto)}</td>
              <td className="py-1 pr-1 text-right">
                {r.pendienteRevision ? (
                  <span className="italic text-amber-700">Pendiente</span>
                ) : (
                  money(r.aceptado)
                )}
              </td>
              <td className="py-1 text-right font-medium">{money(r.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col items-end gap-0.5 border-t border-slate-300 pt-2 text-xs">
        <span>
          Total propuesto: <strong>{money(totalPropuesto)}</strong>
        </span>
        <span>
          Total aceptado: <strong>{money(totalAceptado)}</strong>
        </span>
      </div>

      {mostrarInterno && recibo.renglones.some((r) => r.banda === "justificar" && r.justificacion) && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Justificaciones
          </p>
          <ul className="mt-0.5 flex flex-col gap-1 text-[10px] text-slate-700">
            {recibo.renglones
              .filter((r) => r.banda === "justificar" && r.justificacion)
              .map((r) => (
                <li key={r.numero}>
                  <span className="font-mono font-medium">#{r.numero}</span>{" "}
                  <span className={BANDA_COLOR.justificar}>({BANDA_NOMBRE.justificar})</span>:{" "}
                  {r.justificacion}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-4 border-t border-dashed border-slate-300 pt-3">
        <div>
          <div className="h-8 border-b border-slate-400" />
          <p className="mt-1 text-center text-[9px] text-slate-500">Firma de quien capturó el recibo</p>
        </div>
        <div>
          <div className="h-8 border-b border-slate-400" />
          <p className="mt-1 text-center text-[9px] text-slate-500">Firma del contratista / maquilador</p>
        </div>
      </div>
    </article>
  );
}
