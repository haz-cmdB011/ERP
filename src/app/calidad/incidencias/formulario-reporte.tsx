"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import {
  LIMITES,
  LINEAS,
  MAX_TEXTO_REPORTE,
  TIPOS_INCIDENCIA,
  categoriaDeMotivo,
  textoNormalizado,
  validarIncidencia,
  type Incidencia,
} from "@/lib/calidad/incidencias";
import Modal, {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
  estiloEtiqueta,
} from "@/app/produccion/asignaciones/modal";
import ChipsAreas from "./chips-areas";

// Valores ya registrados, para sugerir al escribir (y escribir igual que el resto).
export interface OpcionesFormulario {
  proyectos: string[];
  areas: string[];
  motivos: string[];
  auditores: string[];
}

const NOMBRE_LINEA = { madera: "Madera", metal: "Metal" } as const;

// Alta o edición de un reporte. Lo que se guarda pasa por `validarIncidencia`
// (la misma limpieza que la importación del Excel) y la base vuelve a exigir sus
// topes y el permiso de Calidad.
export default function FormularioReporte({
  inicial,
  opciones,
  hoy,
  onCerrar,
}: {
  inicial?: Incidencia;
  opciones: OpcionesFormulario;
  hoy: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const idProyectos = useId();
  const idMotivos = useId();
  const idAuditores = useId();
  const [linea, setLinea] = useState<string>(inicial?.linea ?? "");
  const [tipo, setTipo] = useState<string>(inicial?.tipo ?? "");
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy);
  const [proyecto, setProyecto] = useState(inicial?.proyecto ?? "");
  const [muebles, setMuebles] = useState((inicial?.muebles ?? []).join(", "));
  const [areas, setAreas] = useState<string[]>(inicial?.areas ?? []);
  const [motivo, setMotivo] = useState(inicial?.motivo ?? "");
  const [areasReporta, setAreasReporta] = useState<string[]>(inicial?.areas_reporta ?? []);
  const [auditor, setAuditor] = useState(inicial?.auditor ?? "");
  const [estado, setEstado] = useState<string>(inicial?.estado ?? "abierto");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [solucion, setSolucion] = useState(inicial?.solucion ?? "");
  const [seguimiento, setSeguimiento] = useState(inicial?.seguimiento ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoria = motivo.trim() ? categoriaDeMotivo(motivo) : null;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const r = validarIncidencia(
      { linea, tipo, fecha, proyecto, muebles, areas, motivo, areasReporta, auditor, estado, descripcion, solucion, seguimiento },
      hoy
    );
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEnviando(true);
    setError(null);
    const supabase = createClient();
    let fallo: string | null = null;
    if (inicial) {
      // `select` devuelve las filas tocadas: vacío significa que la base no dejó escribir.
      const { data, error } = await supabase.from("incidencias_calidad").update(r.campos).eq("id", inicial.id).select("id");
      if (error) fallo = error.message;
      else if (!data || data.length === 0) fallo = "No se pudo guardar: no tienes permiso o el reporte ya no existe.";
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("incidencias_calidad").insert({ ...r.campos, creado_por: user?.id ?? null });
      if (error) fallo = error.message;
    }
    setEnviando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    avisar(inicial ? "Reporte actualizado." : "Reporte guardado.", "exito");
    onCerrar();
    router.refresh();
  }

  return (
    <Modal
      titulo={inicial ? "Editar reporte" : "Nuevo reporte"}
      subtitulo="Reporte de no conformidad, desviación, incidencia o mejora."
      onCerrar={() => !enviando && onCerrar()}
    >
      <form onSubmit={guardar} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className={estiloEtiqueta}>
            Línea
            <select value={linea} onChange={(e) => setLinea(e.target.value)} className={estiloCampo}>
              <option value="">Elige…</option>
              {LINEAS.map((l) => (
                <option key={l} value={l}>
                  {NOMBRE_LINEA[l]}
                </option>
              ))}
            </select>
          </label>
          <label className={estiloEtiqueta}>
            Fecha
            <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={estiloCampo} />
          </label>
        </div>

        <label className={estiloEtiqueta}>
          Tipo de reporte
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={estiloCampo}>
            <option value="">Elige…</option>
            {TIPOS_INCIDENCIA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className={estiloEtiqueta}>
          Proyecto
          <input
            list={idProyectos}
            value={proyecto}
            maxLength={LIMITES.proyecto}
            onChange={(e) => setProyecto(e.target.value)}
            autoComplete="off"
            className={estiloCampo}
          />
          <datalist id={idProyectos}>
            {opciones.proyectos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>

        <label className={estiloEtiqueta}>
          Muebles o piezas
          <input
            value={muebles}
            onChange={(e) => setMuebles(e.target.value)}
            placeholder="FX-ME-02, PDI-1 (separados por comas)"
            autoComplete="off"
            className={estiloCampo}
          />
        </label>

        <label className={estiloEtiqueta}>
          Motivo
          <input
            list={idMotivos}
            value={motivo}
            maxLength={LIMITES.motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoComplete="off"
            className={estiloCampo}
          />
          <datalist id={idMotivos}>
            {opciones.motivos.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {categoria && (
            <span className="text-xs font-normal text-slate-500">
              Categoría: {categoria}
              {textoNormalizado(motivo) && categoria === "Sin clasificar" ? " (se queda sin clasificar)" : ""}
            </span>
          )}
        </label>

        <ChipsAreas
          etiqueta="Áreas involucradas (dónde nace)"
          valores={areas}
          onCambio={setAreas}
          sugerencias={opciones.areas}
        />
        <ChipsAreas
          etiqueta="Área que reporta (quién lo detecta)"
          valores={areasReporta}
          onCambio={setAreasReporta}
          sugerencias={opciones.areas}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className={estiloEtiqueta}>
            Auditó
            <input
              list={idAuditores}
              value={auditor}
              maxLength={LIMITES.auditor}
              onChange={(e) => setAuditor(e.target.value)}
              autoComplete="off"
              className={estiloCampo}
            />
            <datalist id={idAuditores}>
              {opciones.auditores.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
          <label className={estiloEtiqueta}>
            Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className={estiloCampo}>
              <option value="abierto">Abierto</option>
              <option value="cerrado">Cerrado</option>
            </select>
          </label>
        </div>

        <label className={estiloEtiqueta}>
          Descripción del reporte
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={MAX_TEXTO_REPORTE}
            rows={5}
            placeholder="Qué se detectó, dónde y cuándo."
            className={estiloCampo}
          />
        </label>
        <label className={estiloEtiqueta}>
          Solución
          <textarea
            value={solucion}
            onChange={(e) => setSolucion(e.target.value)}
            maxLength={MAX_TEXTO_REPORTE}
            rows={3}
            placeholder="Qué se hizo o se va a hacer para resolverlo."
            className={estiloCampo}
          />
        </label>
        <label className={estiloEtiqueta}>
          Control y seguimiento
          <textarea
            value={seguimiento}
            onChange={(e) => setSeguimiento(e.target.value)}
            maxLength={MAX_TEXTO_REPORTE}
            rows={3}
            className={estiloCampo}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className={estiloBotonSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={enviando} className={estiloBotonPrimario}>
            {enviando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
