"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/avisos";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { cantidadEnCola } from "@/lib/offline/cola-envios";
import { enviarOGuardar, enviosPendientesDe, hayConexion, usuarioActualId } from "@/lib/offline/cola-navegador";
import type { AvanceTarjeta, TarjetaTablero } from "@/lib/produccion/tablero";
import Modal, { estiloBotonPrimario, estiloBotonSecundario, estiloCampo } from "./asignaciones/modal";
import { COLOR_ESTADO } from "./anillo-estados";

const redondear = (n: number) => Math.round(n * 100) / 100;
const porcentaje = (n: number, total: number) => (total > 0 ? Math.min(100, Math.max(0, Math.round((100 * n) / total))) : 0);

// Ventana para registrar la entrega de un mueble desde su tarjeta del tablero: cuánto avanza (con el % antes y
// después), la cantidad, el folio de la hoja y la fecha (hoy, salvo que se cambie). Registra igual que "Registrar
// entrega" del panel de asignación (misma ruta, misma cola sin conexión y misma regla de la base), así que
// al guardar se actualizan los porcentajes de la tarjeta y del panel. Aquí siempre se entregan muebles
// completos; si el mueble tiene despiece, `hrefPartes` ofrece ir al panel a entregarlo por partes.
export default function EntregarMueble({
  t,
  avance,
  asignacionId,
  hrefPartes = null,
  alCerrar,
}: {
  t: TarjetaTablero;
  avance: AvanceTarjeta;
  asignacionId: string;
  hrefPartes?: string | null;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const unidad = avance.unidad ? ` ${avance.unidad}` : "";
  // Cantidad de esta asignación ya capturada en este aparato esperando red: no se vuelve a ofrecer.
  const [enCola, setEnCola] = useState(0);
  const disponible = Math.max(0, redondear(avance.sinEntregar - enCola));
  const [cantidad, setCantidad] = useState(String(avance.sinEntregar));
  const [folios, setFolios] = useState("");
  const [fecha, setFecha] = useState(hoyMexico());
  const [cambiaFecha, setCambiaFecha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const uid = await usuarioActualId();
        if (!uid) return;
        const enEspera = cantidadEnCola(await enviosPendientesDe(uid), asignacionId);
        if (vigente && enEspera > 0) {
          setEnCola(enEspera);
          setCantidad(String(Math.max(0, redondear(avance.sinEntregar - enEspera))));
        }
      } catch {
        // Sin cola legible: se abre igual, el servidor valida las cantidades.
      }
    })();
    return () => {
      vigente = false;
    };
  }, [asignacionId, avance.sinEntregar]);

  // `subtitulo` llega como "Equipo · Proceso · Detalle": se separa para ordenarlo en el encabezado.
  const [equipo, proceso, ...resto] = (t.subtitulo ?? "").split(" · ");
  const detalle = resto.join(" · ");

  const n = Number(cantidad);
  const valida = Number.isFinite(n) && n > 0 && n <= disponible;
  const nuevas = valida ? n : 0;
  const antes = porcentaje(avance.entregado, avance.total);
  const despues = porcentaje(avance.entregado + nuevas, avance.total);

  function mover(delta: number) {
    const base = Number.isFinite(n) ? n : 0;
    setCantidad(String(redondear(Math.min(disponible, Math.max(0, base + delta)))));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!valida) return;
    setEnviando(true);
    setError(null);
    try {
      const resultado = await enviarOGuardar({
        etiqueta: `${t.numeroPm} · ${t.modelo}${t.subtitulo ? ` · ${t.subtitulo.split(" · ")[0]}` : ""} · ${n}${unidad}`,
        usuarioId: await usuarioActualId(),
        url: "/api/produccion/entregas",
        campos: { asignacionId, fecha, cantidad: String(n), folios },
        archivos: [],
        grupo: asignacionId,
        cantidad: n,
      });
      if (resultado.estado === "rechazado") {
        setError(resultado.mensaje);
        return;
      }
      alCerrar();
      if (resultado.estado === "en-cola") {
        avisar("Sin conexión: la entrega quedó guardada en este aparato y se enviará sola.", "info");
      } else {
        avisar("Entrega registrada y enviada a Calidad");
        router.refresh();
      }
    } catch {
      setError("No se pudo preparar la entrega. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo={t.modelo}
      etiqueta={`Entregar ${t.modelo}`}
      grande
      subtitulo={
        <>
          {/* El componente que se entrega (si es uno): casi el mismo peso que el nombre del modelo. */}
          {detalle && <p className="text-lg font-semibold leading-snug text-slate-700">{detalle}</p>}
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
            <Dato etiqueta="O.T.">{t.ot ?? "Sin O.T."}</Dato>
            <Dato etiqueta="Pedido">
              <span title={t.numeroPm}>{t.pmCorto}</span>
            </Dato>
            {equipo && <Dato etiqueta="Equipo">{equipo}</Dato>}
            {proceso && <Dato etiqueta="Proceso">{proceso}</Dato>}
          </dl>
        </>
      }
      onCerrar={() => !enviando && alCerrar()}
    >
      <form onSubmit={enviar} className="flex flex-col gap-5">
        {!hayConexion() && (
          <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
            Sin conexión: al guardar, la entrega se queda en este aparato y se envía sola cuando vuelva la red.
          </p>
        )}

        {/* Cuánto se entrega, con cómo quedaría el avance: lo de ahora (azul) y lo que suma esta entrega (verde). */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`cantidad-${asignacionId}`} className="text-sm font-medium text-slate-900">
              Cantidad que se entrega
            </label>
            <span className="text-sm tabular-nums text-slate-500">
              Faltan {disponible}
              {unidad}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => mover(-1)}
              aria-label="Una menos"
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-300 text-xl text-slate-700 hover:bg-slate-50 sm:size-10"
            >
              −
            </button>
            <input
              id={`cantidad-${asignacionId}`}
              type="number"
              required
              min="0.01"
              max={disponible}
              step="any"
              inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={`${estiloCampo} text-center text-lg font-semibold tabular-nums`}
            />
            <button
              type="button"
              onClick={() => mover(1)}
              aria-label="Una más"
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-300 text-xl text-slate-700 hover:bg-slate-50 sm:size-10"
            >
              +
            </button>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
            <span className="h-full" style={{ width: `${antes}%`, background: COLOR_ESTADO.en_proceso }} />
            <span
              className="h-full transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${Math.max(0, despues - antes)}%`, background: COLOR_ESTADO.terminado }}
            />
          </div>
          <p className="flex items-center justify-between gap-3 text-sm text-slate-500" aria-live="polite">
            <span className="tabular-nums">
              Quedará en {despues}%
              {enCola > 0 && `, con ${enCola} ya capturadas aquí esperando red`}
            </span>
            {cantidad !== String(disponible) && disponible > 0 && (
              <button
                type="button"
                onClick={() => setCantidad(String(disponible))}
                className="shrink-0 font-medium text-brand-700 hover:underline"
              >
                Entregar todo
              </button>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-900">
            Folio de la hoja de entrega
            <input
              type="text"
              required
              maxLength={500}
              value={folios}
              onChange={(e) => setFolios(e.target.value)}
              placeholder="El que viene en la hoja de papel"
              className={estiloCampo}
            />
          </label>
          {cambiaFecha ? (
            <label className="flex flex-col gap-1.5 pt-2 text-sm font-medium text-slate-900">
              Fecha en que terminó
              <input
                type="date"
                required
                value={fecha}
                min={avance.fechaAsignacion ?? undefined}
                max={hoyMexico()}
                onChange={(e) => setFecha(e.target.value)}
                className={estiloCampo}
              />
            </label>
          ) : (
            <p className="text-sm text-slate-500">
              Terminó hoy.{" "}
              <button type="button" onClick={() => setCambiaFecha(true)} className="font-medium text-brand-700 hover:underline">
                Cambiar fecha
              </button>
            </p>
          )}
        </div>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {hrefPartes ? (
            <Link
              href={hrefPartes}
              title="Este mueble tiene despiece: la entrega por partes se registra en el panel"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Entregar por partes
            </Link>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={alCerrar} disabled={enviando} className={estiloBotonSecundario}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando || !valida || !folios.trim()} className={estiloBotonPrimario}>
              {enviando ? "Guardando…" : valida ? `Entregar ${n}${unidad}` : "Entregar"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// Un dato del encabezado, en una línea: su nombre apagado y el valor un peldaño más fuerte (manda el nombre del mueble).
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1.5 text-sm">
      <dt className="text-slate-500">{etiqueta}</dt>
      <dd className="font-medium text-slate-800">{children}</dd>
    </div>
  );
}
