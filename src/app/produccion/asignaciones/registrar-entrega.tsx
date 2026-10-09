"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/avisos";
import { hoyMexico, type ResultadoRevision } from "@/lib/produccion/asignaciones";
import { reducirFotoEnNavegador } from "@/lib/produccion/reducir-foto-navegador";
import { cantidadEnCola } from "@/lib/offline/cola-envios";
import {
  enviarOGuardar,
  enviosPendientesDe,
  hayConexion,
  usuarioActualId,
} from "@/lib/offline/cola-navegador";
import Modal, {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
  estiloEtiqueta,
} from "./modal";

// Botón "Registrar entrega": el equipo terminó (todo o parte). El encargado
// escribe el folio de la hoja de entrega (papel; no son los folios CAL- de
// Calidad, que salen después al evaluar el lote) y sube la foto de la hoja; la foto se reduce
// aquí y el servidor la comprime antes de guardarla.
//
// En ese mismo momento decide si las piezas cumplen (la preaprobación de Producción): si
// cumplen pasan directo a Calidad; si no, la entrega queda rechazada con su motivo y el
// equipo vuelve a entregarlas.
//
// Si se cae la red, la entrega (con su foto) se guarda en este aparato y se manda sola al
// volver la conexión (ver src/lib/offline). El servidor reconoce los reintentos, así que
// no se duplica.
export default function RegistrarEntrega({
  asignacionId,
  descripcion,
  pendiente,
  unidad,
  fechaAsignacion,
}: {
  asignacionId: string;
  descripcion: string;
  pendiente: number;
  unidad: string | null;
  fechaAsignacion: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [folios, setFolios] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [decision, setDecision] = useState<ResultadoRevision | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  // 0-100 mientras se sube la foto (null cuando no se está enviando).
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cantidad de esta asignación ya capturada y guardada en el aparato esperando red.
  const [enCola, setEnCola] = useState(0);
  const [, refrescarConexion] = useState(0);

  // Mientras el formulario está abierto, el aviso de "sin conexión" sigue a la red.
  useEffect(() => {
    if (!abierto) return;
    const alCambiar = () => refrescarConexion((n) => n + 1);
    window.addEventListener("online", alCambiar);
    window.addEventListener("offline", alCambiar);
    return () => {
      window.removeEventListener("online", alCambiar);
      window.removeEventListener("offline", alCambiar);
    };
  }, [abierto]);

  // Libera la URL de la vista previa al cambiar de foto o cerrar.
  useEffect(() => {
    if (!vistaPrevia) return;
    return () => URL.revokeObjectURL(vistaPrevia);
  }, [vistaPrevia]);

  function elegirFoto(archivo: File | null) {
    setFoto(archivo);
    setVistaPrevia(archivo ? URL.createObjectURL(archivo) : null);
  }

  // Lo que falta por entregar descontando lo que ya está capturado y en espera de red.
  const disponible = Math.max(0, pendiente - enCola);

  async function abrir() {
    let enEspera = 0;
    try {
      const uid = await usuarioActualId();
      if (uid) enEspera = cantidadEnCola(await enviosPendientesDe(uid), asignacionId);
    } catch {
      // Sin cola legible: se abre igual, el servidor valida las cantidades.
    }
    setEnCola(enEspera);
    setFecha(hoyMexico());
    setCantidad(String(Math.max(0, pendiente - enEspera)));
    setFolios("");
    elegirFoto(null);
    setDecision(null);
    setMotivo("");
    setError(null);
    setAbierto(true);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!foto) {
      setError("Toma o elige la foto de la hoja de entrega.");
      return;
    }
    if (!decision) {
      setError("Indica si las piezas cumplen.");
      return;
    }
    if (decision === "no_cumple" && !motivo.trim()) {
      setError("Escribe por qué no cumplen las piezas.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const reducida = await reducirFotoEnNavegador(foto);
      setProgreso(0);
      const resultado = await enviarOGuardar(
        {
          etiqueta: `${descripcion} · ${cantidad} ${unidad ?? ""}`.trim(),
          usuarioId: await usuarioActualId(),
          url: "/api/produccion/entregas",
          campos: {
            asignacionId,
            fecha,
            cantidad,
            folios,
            resultado: decision,
            ...(decision === "no_cumple" ? { motivo } : {}),
          },
          archivos: [{ campo: "foto", nombre: "hoja-entrega.jpg", blob: reducida }],
          grupo: asignacionId,
          // Lo que no cumple no cuenta como entregado: no descuenta de lo pendiente.
          cantidad: decision === "no_cumple" ? 0 : Number(cantidad) || 0,
        },
        setProgreso
      );
      if (resultado.estado === "rechazado") {
        setError(resultado.mensaje);
        return;
      }
      setAbierto(false);
      if (resultado.estado === "en-cola") {
        avisar("Sin conexión: la entrega quedó guardada en este aparato y se enviará sola.", "info");
      } else {
        avisar(
          decision === "cumple"
            ? "Entrega registrada y enviada a Calidad"
            : "Entrega registrada y regresada al equipo"
        );
        router.refresh();
      }
    } catch {
      setError("No se pudo preparar la entrega. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
      setProgreso(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 sm:px-3 sm:py-1.5 sm:text-xs"
      >
        Registrar entrega
      </button>
      {abierto && (
        <Modal
          titulo="Registrar entrega"
          subtitulo={`${descripcion} · faltan ${disponible} ${unidad ?? ""}`}
          onCerrar={() => !enviando && setAbierto(false)}
        >
          <form onSubmit={enviar} className="flex flex-col gap-3">
            {!hayConexion() && (
              <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                Sin conexión: al guardar, la entrega y su foto se quedan en este aparato y se envían solas
                cuando vuelva la red. No cierres sesión hasta que se envíe.
              </p>
            )}
            {enCola > 0 && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                Ya hay {enCola} {unidad ?? ""} de esta asignación capturadas en este aparato, esperando red.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className={estiloEtiqueta}>
                Fecha en que terminó
                <input
                  type="date"
                  required
                  value={fecha}
                  min={fechaAsignacion}
                  max={hoyMexico()}
                  onChange={(e) => setFecha(e.target.value)}
                  className={estiloCampo}
                />
              </label>
              <label className={estiloEtiqueta}>
                Cantidad entregada
                <input
                  type="number"
                  required
                  min="0.01"
                  max={disponible}
                  step="any"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={estiloCampo}
                />
                {cantidad !== String(disponible) && (
                  <button
                    type="button"
                    onClick={() => setCantidad(String(disponible))}
                    className="self-start text-xs font-medium text-brand-700 hover:underline"
                  >
                    Entregar todo ({disponible})
                  </button>
                )}
              </label>
            </div>
            <label className={estiloEtiqueta}>
              Folio de la hoja de entrega
              <textarea
                required
                rows={2}
                maxLength={500}
                value={folios}
                onChange={(e) => setFolios(e.target.value)}
                placeholder="El que viene en la hoja de papel"
                className={estiloCampo}
              />
            </label>
            <label className={estiloEtiqueta}>
              Foto de la hoja de entrega
              <input
                type="file"
                required
                accept="image/*"
                capture="environment"
                onChange={(e) => elegirFoto(e.target.files?.[0] ?? null)}
                className="text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-3 file:text-base file:font-medium file:text-on-brand sm:file:bg-slate-100 sm:file:py-2 sm:file:text-sm sm:file:text-slate-700"
              />
              <span className="text-xs font-normal text-slate-500">
                Se comprime automáticamente antes de guardarse.
              </span>
            </label>
            {vistaPrevia && (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
              <img
                src={vistaPrevia}
                alt="Vista previa de la foto"
                className="max-h-48 w-full rounded-lg border border-slate-200 object-contain"
              />
            )}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">¿Las piezas cumplen?</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      valor: "cumple",
                      titulo: "Cumplen",
                      detalle: "Pasan a Calidad",
                      activo: "border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500",
                    },
                    {
                      valor: "no_cumple",
                      titulo: "No cumplen",
                      detalle: "Regresan al equipo",
                      activo: "border-rose-500 bg-rose-50 text-rose-800 ring-1 ring-rose-500",
                    },
                  ] as const
                ).map((o) => (
                  <label
                    key={o.valor}
                    className={`flex min-h-12 cursor-pointer flex-col justify-center rounded-lg border px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600 ${
                      decision === o.valor ? o.activo : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="resultado"
                      value={o.valor}
                      checked={decision === o.valor}
                      onChange={() => setDecision(o.valor)}
                      className="sr-only"
                    />
                    <span className="font-semibold">{o.titulo}</span>
                    <span className="text-xs opacity-80">{o.detalle}</span>
                  </label>
                ))}
              </div>
              {decision === "no_cumple" && (
                <label className={estiloEtiqueta}>
                  ¿Por qué no cumplen?
                  <textarea
                    required
                    rows={2}
                    maxLength={500}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Lo que el equipo tiene que corregir"
                    className={estiloCampo}
                  />
                  <span className="text-xs font-normal text-slate-500">
                    La entrega queda en el historial como rechazada y estas piezas siguen pendientes del equipo.
                  </span>
                </label>
              )}
            </fieldset>
            {progreso !== null && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span>{progreso < 100 ? "Subiendo foto…" : "Guardando entrega…"}</span>
                  <span className="font-medium tabular-nums">{progreso}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progreso}
                  aria-label="Progreso de la entrega"
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                >
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
              </div>
            )}
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
            )}
            <div className="sticky bottom-0 -mx-5 -mb-5 mt-1 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3 sm:static sm:m-0 sm:border-0 sm:p-0">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={enviando}
                className={estiloBotonSecundario}
              >
                Cancelar
              </button>
              <button type="submit" disabled={enviando || disponible <= 0} className={estiloBotonPrimario}>
                {enviando
                  ? "Guardando…"
                  : decision === "no_cumple"
                    ? "Guardar y regresar al equipo"
                    : decision === "cumple"
                      ? "Guardar y mandar a Calidad"
                      : "Guardar entrega"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
