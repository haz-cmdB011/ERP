"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/avisos";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { reducirFotoEnNavegador } from "@/lib/produccion/reducir-foto-navegador";
import Modal, {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
  estiloEtiqueta,
} from "./modal";

// Botón "Registrar entrega": el equipo terminó (todo o parte). El encargado
// escribe los folios de Calidad y sube la foto de la hoja; la foto se reduce
// aquí y el servidor la comprime antes de guardarla.
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
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Libera la URL de la vista previa al cambiar de foto o cerrar.
  useEffect(() => {
    if (!vistaPrevia) return;
    return () => URL.revokeObjectURL(vistaPrevia);
  }, [vistaPrevia]);

  function elegirFoto(archivo: File | null) {
    setFoto(archivo);
    setVistaPrevia(archivo ? URL.createObjectURL(archivo) : null);
  }

  function abrir() {
    setFecha(hoyMexico());
    setCantidad(String(pendiente));
    setFolios("");
    elegirFoto(null);
    setError(null);
    setAbierto(true);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!foto) {
      setError("Toma o elige la foto de los folios.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const reducida = await reducirFotoEnNavegador(foto);
      const datos = new FormData();
      datos.set("asignacionId", asignacionId);
      datos.set("fecha", fecha);
      datos.set("cantidad", cantidad);
      datos.set("folios", folios);
      datos.set("foto", reducida, "folios.jpg");
      const res = await fetch("/api/produccion/entregas", { method: "POST", body: datos });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "No se pudo registrar la entrega.");
        return;
      }
      setAbierto(false);
      avisar("Entrega registrada");
      router.refresh();
    } catch {
      setError("No se pudo conectar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
      >
        Registrar entrega
      </button>
      {abierto && (
        <Modal
          titulo="Registrar entrega"
          subtitulo={`${descripcion} · faltan ${pendiente} ${unidad ?? ""}`}
          onCerrar={() => !enviando && setAbierto(false)}
        >
          <form onSubmit={enviar} className="flex flex-col gap-3">
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
                  max={pendiente}
                  step="any"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={estiloCampo}
                />
              </label>
            </div>
            <label className={estiloEtiqueta}>
              Folios de Calidad
              <textarea
                required
                rows={2}
                maxLength={500}
                value={folios}
                onChange={(e) => setFolios(e.target.value)}
                placeholder="Ej. CAL-000123, CAL-000124"
                className={estiloCampo}
              />
            </label>
            <label className={estiloEtiqueta}>
              Foto de los folios
              <input
                type="file"
                required
                accept="image/*"
                capture="environment"
                onChange={(e) => elegirFoto(e.target.files?.[0] ?? null)}
                className="text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
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
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={enviando}
                className={estiloBotonSecundario}
              >
                Cancelar
              </button>
              <button type="submit" disabled={enviando} className={estiloBotonPrimario}>
                {enviando ? "Guardando…" : "Guardar entrega"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
