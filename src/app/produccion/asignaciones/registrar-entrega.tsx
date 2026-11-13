"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/avisos";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { completosPorPartes, faltanDeParte, type ParteEntrega } from "@/lib/produccion/entregas-partes";
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
// escribe la fecha, la cantidad y el folio de la hoja de entrega (papel; no son los folios
// CAL- de Calidad, que salen después al evaluar). Producción no califica las piezas ni sube
// foto: la entrega pasa a Calidad, que es quien evalúa (migración
// entrega_sin_foto_ni_calificacion).
//
// Si se cae la red, la entrega se guarda en este aparato y se manda sola al volver la
// conexión (ver src/lib/offline). El servidor reconoce los reintentos, así que no se duplica.
export default function RegistrarEntrega({
  asignacionId,
  descripcion,
  pendiente,
  unidad,
  fechaAsignacion,
  cantidadAsignada,
  partes,
  procesoEtiqueta,
}: {
  asignacionId: string;
  descripcion: string;
  pendiente: number;
  unidad: string | null;
  fechaAsignacion: string;
  // Muebles de la asignación (para los topes por parte); solo con `partes`.
  cantidadAsignada?: number;
  // Las partes del despiece del mueble: con ellas se puede entregar por partes (lo que ya está,
  // aunque el mueble aún no esté completo). Sin ellas, solo la entrega del mueble completo.
  partes?: ParteEntrega[];
  // Proceso de la asignación ("Barniz"): se dice en el formulario por partes.
  procesoEtiqueta?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [folios, setFolios] = useState("");
  // Entrega del mueble completo o por partes, y las piezas que se capturan de cada parte.
  const [modo, setModo] = useState<"mueble" | "partes">("mueble");
  const [piezas, setPiezas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
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
    setModo("mueble");
    setPiezas({});
    setError(null);
    setAbierto(true);
  }

  const conPartes = !!partes && partes.length > 0 && (cantidadAsignada ?? 0) > 0;
  const nuevas = Object.fromEntries(
    (partes ?? []).map((p) => [p.id, Math.max(0, Number(piezas[p.id]) || 0)])
  );
  const hayPiezas = Object.values(nuevas).some((n) => n > 0);
  const pasaDeLoQueFalta = (partes ?? []).some((p) => nuevas[p.id] > faltanDeParte(p, cantidadAsignada ?? 0));
  const completosAhora = completosPorPartes(partes ?? [], cantidadAsignada ?? 0);
  const completosConEsto = completosPorPartes(partes ?? [], cantidadAsignada ?? 0, nuevas);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const porPartes = conPartes && modo === "partes";
    try {
      const resultado = await enviarOGuardar({
        etiqueta: porPartes
          ? `${descripcion} · por partes`
          : `${descripcion} · ${cantidad} ${unidad ?? ""}`.trim(),
        usuarioId: await usuarioActualId(),
        url: "/api/produccion/entregas",
        campos: porPartes
          ? {
              asignacionId,
              fecha,
              folios,
              partes: JSON.stringify(
                (partes ?? []).filter((p) => nuevas[p.id] > 0).map((p) => ({ parteId: p.id, piezas: nuevas[p.id] }))
              ),
            }
          : { asignacionId, fecha, cantidad, folios },
        archivos: [],
        grupo: asignacionId,
        // Por partes no suma muebles en la cola: los completos los calcula la base al recibirla.
        cantidad: porPartes ? 0 : Number(cantidad) || 0,
      });
      if (resultado.estado === "rechazado") {
        setError(resultado.mensaje);
        return;
      }
      setAbierto(false);
      if (resultado.estado === "en-cola") {
        avisar("Sin conexión: la entrega quedó guardada en este aparato y se enviará sola.", "info");
      } else {
        avisar(
          porPartes && completosConEsto > completosAhora
            ? `Entrega por partes registrada: ${completosConEsto - completosAhora} mueble(s) completo(s) pasan a Calidad.`
            : porPartes
              ? "Entrega por partes registrada. Aún no se completa otro mueble."
              : "Entrega registrada y enviada a Calidad"
        );
        router.refresh();
      }
    } catch {
      setError("No se pudo preparar la entrega. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
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
                Sin conexión: al guardar, la entrega se queda en este aparato y se envían solas
                cuando vuelva la red. No cierres sesión hasta que se envíe.
              </p>
            )}
            {enCola > 0 && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                Ya hay {enCola} {unidad ?? ""} de esta asignación capturadas en este aparato, esperando red.
              </p>
            )}
            {conPartes && (
              <div
                role="group"
                aria-label="Qué se entrega"
                className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-0.5 text-sm"
              >
                {(["mueble", "partes"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModo(m)}
                    aria-pressed={modo === m}
                    className={`rounded-md px-3 py-1.5 whitespace-nowrap transition-colors ${
                      modo === m ? "bg-slate-900 font-medium text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {m === "mueble" ? "Mueble completo" : "Por partes"}
                  </button>
                ))}
              </div>
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
              {conPartes && modo === "partes" ? null : (
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
              )}
            </div>
            {conPartes && modo === "partes" && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-600">
                  Escribe las piezas que se entregan hoy de cada parte
                  {procesoEtiqueta ? ` en ${procesoEtiqueta}` : ""}. Solo salen las partes que pasan por ese
                  proceso. El mueble pasa a Calidad cuando todas lo alcanzan.
                </p>
                <ul className="flex flex-col gap-2">
                  {(partes ?? []).map((p) => {
                    const falta = faltanDeParte(p, cantidadAsignada ?? 0);
                    const total = p.piezasPorMueble * (cantidadAsignada ?? 0);
                    return (
                      <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{p.descripcion}</p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {p.entregadas} de {total} {p.unidad ?? "pz"} entregadas
                            {falta > 0 && (
                              <>
                                {" · "}
                                <button
                                  type="button"
                                  onClick={() => setPiezas((prev) => ({ ...prev, [p.id]: String(falta) }))}
                                  className="font-medium text-brand-700 hover:underline"
                                >
                                  Entregar las {falta} que faltan
                                </button>
                              </>
                            )}
                          </p>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max={falta}
                          step="any"
                          inputMode="decimal"
                          disabled={falta <= 0}
                          aria-label={`Piezas entregadas de ${p.descripcion}`}
                          value={piezas[p.id] ?? ""}
                          onChange={(e) => {
                            const valor = e.target.value;
                            setPiezas((prev) => ({ ...prev, [p.id]: valor }));
                          }}
                          placeholder="0"
                          className={`${estiloCampo} tabular-nums`}
                        />
                      </li>
                    );
                  })}
                </ul>
                <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700 tabular-nums" aria-live="polite">
                  Muebles completos: {completosAhora} de {cantidadAsignada}
                  {hayPiezas && completosConEsto > completosAhora && (
                    <span className="font-medium text-emerald-700">
                      {" "}
                      → con esta entrega, {completosConEsto}
                    </span>
                  )}
                </p>
                {pasaDeLoQueFalta && (
                  <p className="text-sm text-red-700">Una parte pasa de las piezas que faltan por entregar.</p>
                )}
              </div>
            )}
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
              <button
                type="submit"
                disabled={
                  enviando ||
                  (conPartes && modo === "partes" ? !hayPiezas || pasaDeLoQueFalta : disponible <= 0)
                }
                className={estiloBotonPrimario}
              >
                {enviando ? "Guardando…" : "Guardar entrega"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
