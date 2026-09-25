import type { ReciboGuardado } from "@/lib/estimaciones/recibos-db";
import { BANDA_NOMBRE, money } from "@/lib/estimaciones/motor-precio";
import type { Banda } from "@/lib/estimaciones/motor-precio";
import QrCode from "../acabados/qr-code";

const BANDA_COLOR: Record<Banda, string> = {
  auto: "text-emerald-700",
  estimador: "text-amber-700",
  justificar: "text-rose-700",
};

function LogoMobiliarium() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- asset estático simple, no next/image
    <img src="/branding/mobiliarium-logo.png" alt="Mobiliarium — creating lifestyle" className="h-10" />
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-300 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{valor}</span>
    </div>
  );
}

// Ficha imprimible del recibo de maquila de Armado: se usa tanto en la
// página de seguimiento (a la que apunta el QR) como fuente de captura para
// el PDF que se descarga al guardar. Marcada con data-informe para que
// descargar-pdf-button.tsx la capture.
export default function ReciboFichaArmado({
  recibo,
  qrUrl,
}: {
  recibo: ReciboGuardado;
  qrUrl: string;
}) {
  const totalPropuesto = recibo.renglones.reduce((s, r) => s + r.cantidad * r.propuesto, 0);
  const totalAceptado = recibo.renglones.reduce((s, r) => s + r.importe, 0);
  const guardadoEn = new Date(recibo.guardadoEn).toLocaleString("es-MX");

  return (
    <article data-informe className="mx-auto flex w-full max-w-xl flex-col gap-3 bg-white p-4">
      <header className="flex flex-col items-center gap-2 text-center">
        <LogoMobiliarium />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Recibo de Maquila — Armado
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
        <Campo label="Guardado" valor={guardadoEn} />
      </div>

      <table className="w-full border-collapse text-left text-[10px]">
        <thead>
          <tr className="border-b border-slate-300 text-slate-500">
            <th className="py-1 pr-1">#</th>
            <th className="py-1 pr-1">Modelo</th>
            <th className="py-1 pr-1">Armado</th>
            <th className="py-1 pr-1">Familia</th>
            <th className="py-1 pr-1 text-right">Cant.</th>
            <th className="py-1 pr-1 text-right">Propuesto</th>
            <th className="py-1 pr-1 text-right">Aceptado</th>
            <th className="py-1 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {recibo.renglones.map((r) => (
            <tr key={r.numero} className="border-b border-slate-100 align-top">
              <td className="py-1 pr-1 font-mono">{r.numero}</td>
              <td className="py-1 pr-1 font-mono">{r.modelo}</td>
              <td className="py-1 pr-1">
                {r.tipoArmado || "—"}
                {r.colocacionHerrajes ? " + herrajes" : ""}
              </td>
              <td className="py-1 pr-1">{r.familia}</td>
              <td className="py-1 pr-1 text-right">{r.cantidad}</td>
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

      {recibo.renglones.some((r) => r.banda === "justificar" && r.justificacion) && (
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
                  <span className={BANDA_COLOR[r.banda]}>({BANDA_NOMBRE[r.banda]})</span>:{" "}
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
