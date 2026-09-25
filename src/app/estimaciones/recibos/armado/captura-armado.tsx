"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SelectMenu from "@/components/select-menu";
import { createClient } from "@/lib/supabase/client";
import {
  CATALOGO,
  CAUSAS_REPROCESO,
  FAMILIAS,
  MODELOS,
  OBRAS,
  OTS,
  PRIORIDAD,
  VOLUMEN,
  type RenglonHistorico,
} from "@/lib/estimaciones/datos-acabados";
import {
  TARIFAS_BASE_ARMADO,
  TARIFAS_FIJAS_ARMADO,
  TIPOS_ARMADO,
} from "@/lib/estimaciones/datos-armado";
import {
  BANDA_NOMBRE,
  FUENTE_NOMBRE,
  bandaDe,
  fechaCorta,
  money,
  normalizar,
  resolver,
  type Banda,
  type ConfiguracionMotor,
  type EntradaRenglon,
  type Fuente,
  type TarifaProyecto,
} from "@/lib/estimaciones/motor-precio";
import {
  cargarHistoricoDb,
  guardarReciboEnDb,
  type ReciboGuardado,
  type RenglonGuardado,
  type RenglonParaGuardar,
} from "@/lib/estimaciones/recibos-db";
import { generarPdfDesdeElemento } from "../acabados/generar-pdf";
import DescargarPdfButton from "../acabados/descargar-pdf-button";
import ReciboFichaArmado from "./recibo-ficha-armado";

interface Renglon {
  id: number;
  modelo: string;
  familia: string;
  tamano: string;
  cantidad: number | "";
  tipoArmado: string;
  tipoTrabajo: "produccion" | "reproceso";
  causa: string;
  propuesto: number | "";
  aceptado: number | "";
  justificacion: string;
  nota: string;
  tocadoAceptado: boolean;
  colapsado: boolean;
}

let seq = 0;
function nuevoRenglon(pre: Partial<Renglon> = {}): Renglon {
  seq += 1;
  return {
    id: seq,
    modelo: "",
    familia: "",
    tamano: "",
    cantidad: 1,
    tipoArmado: "",
    tipoTrabajo: "produccion",
    causa: "",
    propuesto: 0,
    aceptado: 0,
    justificacion: "",
    nota: "",
    tocadoAceptado: false,
    colapsado: false,
    ...pre,
  };
}

const BANDA_ESTILO: Record<string, string> = {
  auto: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  estimador: "bg-amber-50 text-amber-700 ring-amber-200",
  justificar: "bg-rose-50 text-rose-700 ring-rose-200",
};

const ETIQUETA = "text-[11px] font-medium uppercase tracking-wide text-slate-500";
const CONTROL =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 " +
  "focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function comoOpciones(valores: readonly string[]) {
  return valores.map((v) => ({ value: v, label: v }));
}

// Entrada del motor de precio para un renglón de Armado: el tipo de armado
// ocupa el lugar del acabado y no hay segundo acabado.
function aEntrada(r: Renglon): EntradaRenglon {
  return {
    modelo: r.modelo,
    familia: r.familia,
    tamano: r.tamano,
    cantidad: r.cantidad,
    acabado: r.tipoArmado,
    acabado2: "",
    tipoArmado: r.tipoArmado,
  };
}

export default function CapturaArmado({ puedeVerSugerido }: { puedeVerSugerido: boolean }) {
  // Arranca con un renglón vacío: Armado no tiene histórico ni tarifas de
  // ejemplo (las de Acabados no aplican al armado).
  const [renglones, setRenglones] = useState<Renglon[]>(() => [nuevoRenglon()]);

  const [folio, setFolio] = useState("");
  const [fecha, setFecha] = useState("");
  const [contratista, setContratista] = useState("");
  const [obra, setObra] = useState("");
  const [ot, setOt] = useState("");
  const [prioridad, setPrioridad] = useState("normal");
  const [motivo, setMotivo] = useState("");
  const [numeroInicial, setNumeroInicial] = useState(1);
  const [folioContinuado, setFolioContinuado] = useState(false);

  const [nivel3Visible, setNivel3Visible] = useState(false);
  const [tarifasProyecto, setTarifasProyecto] = useState<TarifaProyecto[]>([]);
  const [tpModelo, setTpModelo] = useState("");
  const [tpTarifa, setTpTarifa] = useState("");
  const [parametrosAbiertos, setParametrosAbiertos] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string[] } | null>(null);

  // Renglones de Armado ya guardados en Supabase (ver recibos-db.ts): son el
  // histórico de este tipo de recibo (el de Acabados no se mezcla). Un recibo
  // recién guardado sirve de precedente al siguiente renglón capturado, así
  // que se recarga después de cada guardado.
  const [historico, setHistoricoDb] = useState<RenglonHistorico[]>([]);

  useEffect(() => {
    const supabase = createClient();
    cargarHistoricoDb(supabase, "armado").then(setHistoricoDb);
  }, []);

  const [reciboGuardado, setReciboGuardado] = useState<ReciboGuardado | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const fichaOcultaRef = useRef<HTMLDivElement>(null);

  const cfg: ConfiguracionMotor = useMemo(
    () => ({
      nivel3Visible,
      recargoAcabado2: 0,
      tarifasProyecto,
      tarifasFijas: TARIFAS_FIJAS_ARMADO,
      tarifasBase: TARIFAS_BASE_ARMADO,
    }),
    [nivel3Visible, tarifasProyecto]
  );
  const recibo = { ot, prioridad };

  const folioPrevio = useMemo(() => {
    const f = folio.trim();
    if (!f) return [];
    return historico.filter((h) => h.folio === f);
  }, [folio, historico]);

  function actualizar(id: number, cambios: Partial<Renglon>) {
    setRenglones((prev) => prev.map((r) => (r.id === id ? { ...r, ...cambios } : r)));
    setResultado(null);
  }

  function quitar(id: number) {
    setRenglones((prev) => prev.filter((r) => r.id !== id));
    setResultado(null);
  }

  function alternarColapso(id: number) {
    setRenglones((prev) => prev.map((r) => (r.id === id ? { ...r, colapsado: !r.colapsado } : r)));
  }

  function continuarFolio() {
    const p = folioPrevio[0];
    setNumeroInicial(folioPrevio.length + 1);
    setObra(p.obra);
    setOt(p.ot);
    setFecha(p.fecha);
    setFolioContinuado(true);
  }

  function agregarTarifaProyecto() {
    const m = normalizar(tpModelo);
    const t = Number(tpTarifa);
    if (!m || !(t > 0)) return;
    const otN = normalizar(ot);
    setTarifasProyecto((prev) => [
      ...prev.filter((x) => !(x.ot === otN && x.modelo === m)),
      { ot: otN, modelo: m, tarifa: t },
    ]);
    setTpModelo("");
    setTpTarifa("");
  }

  // En banda 'auto' el aceptado sigue al propuesto mientras el estimador no
  // lo toque: no hay nada que negociar, así que no se le pide capturarlo.
  function aceptadoEfectivo(r: Renglon): number {
    const res = resolver(aEntrada(r), recibo, cfg, historico);
    const esManual = res.fuente === "manual" || res.sombra;
    const b = bandaDe(esManual ? null : res.pu, Number(r.propuesto) || 0, esManual);
    if (b.banda === "auto" && !r.tocadoAceptado) return Number(r.propuesto) || 0;
    return Number(r.aceptado) || 0;
  }

  const totales = renglones.reduce(
    (acc, r) => {
      const c = Number(r.cantidad) || 0;
      acc.propuesto += c * (Number(r.propuesto) || 0);
      acc.aceptado += c * (puedeVerSugerido ? aceptadoEfectivo(r) : 0);
      return acc;
    },
    { propuesto: 0, aceptado: 0 }
  );
  const recorte = totales.propuesto - totales.aceptado;
  const recortePct = totales.propuesto > 0 ? (recorte / totales.propuesto) * 100 : 0;

  async function generarPdfAutomatico(nombreArchivo: string) {
    setGenerandoPdf(true);
    try {
      const elemento = fichaOcultaRef.current?.querySelector<HTMLElement>("[data-informe]");
      if (!elemento) return;
      await generarPdfDesdeElemento(elemento, nombreArchivo);
    } finally {
      setGenerandoPdf(false);
    }
  }

  async function guardar() {
    const problemas: string[] = [];
    if (!folio.trim()) problemas.push("Falta el folio.");
    if (!fecha.trim()) problemas.push("Falta la fecha del recibo.");
    if (!contratista.trim()) problemas.push("Falta el contratista.");
    if (prioridad !== "normal" && !motivo.trim()) {
      problemas.push(`La prioridad ${prioridad} exige un motivo.`);
    }
    if (!renglones.length) problemas.push("El recibo no tiene renglones.");

    let sombras = 0;
    const renglonesGuardados: RenglonGuardado[] = [];
    const renglonesParaDb: RenglonParaGuardar[] = [];

    renglones.forEach((r, i) => {
      const res = resolver(aEntrada(r), recibo, cfg, historico);
      const esManual = res.fuente === "manual" || res.sombra;
      if (res.sombra) sombras += 1;
      const b = bandaDe(esManual ? null : res.pu, Number(r.propuesto) || 0, esManual);
      const num = numeroInicial + i;

      if (!r.modelo.trim()) problemas.push(`Renglón #${num}: falta el modelo.`);
      if (!r.tipoArmado) problemas.push(`Renglón #${num}: falta el tipo de armado.`);
      if (!r.familia) problemas.push(`Renglón #${num}: falta la familia.`);
      if (!(Number(r.propuesto) > 0)) problemas.push(`Renglón #${num}: falta el precio propuesto.`);

      // Solo a quien ve el precio sugerido se le exige decidir y justificar:
      // el resto solo captura lo que propuso el maquilador y queda
      // pendiente de que el desarrollador o el admin del área lo revise —
      // pero la banda se calcula igual (no se pierde la señal) y si cae en
      // "justificar" se guarda una nota automática, porque la base exige
      // justificación siempre que la banda sea esa.
      if (puedeVerSugerido && b.banda === "justificar" && !r.justificacion.trim()) {
        problemas.push(`Renglón #${num}: falta justificación.`);
      }

      const aceptadoFinal = puedeVerSugerido ? aceptadoEfectivo(r) : 0;
      const justificacionFinal = puedeVerSugerido
        ? r.justificacion
        : b.banda === "justificar"
          ? "Pendiente de revisión: capturado sin ver el precio sugerido."
          : r.justificacion;
      const fuenteFinal = (esManual ? "manual" : res.fuente) as Fuente;
      const bandaFinal = b.banda as Banda;

      renglonesGuardados.push({
        numero: num,
        modelo: normalizar(r.modelo),
        familia: r.familia,
        tamano: r.tamano,
        cantidad: Number(r.cantidad) || 0,
        acabado: "",
        acabado2: "",
        tipoArmado: r.tipoArmado,
        tipoTrabajo: r.tipoTrabajo,
        causa: r.causa,
        fases: [],
        nota: r.nota,
        puSugerido: esManual ? null : res.pu,
        fuente: fuenteFinal,
        banda: bandaFinal,
        propuesto: Number(r.propuesto) || 0,
        aceptado: aceptadoFinal,
        importe: (Number(r.cantidad) || 0) * aceptadoFinal,
        justificacion: justificacionFinal,
        pendienteRevision: !puedeVerSugerido,
      });

      renglonesParaDb.push({
        modelo: normalizar(r.modelo),
        familia: r.familia,
        acabado: "",
        acabado2: "",
        tipoArmado: r.tipoArmado,
        tipoTrabajo: r.tipoTrabajo,
        causa: r.causa,
        cantidad: Number(r.cantidad) || 0,
        tamano: r.tamano,
        fases: [],
        puSugerido: esManual ? null : res.pu,
        fuente: fuenteFinal,
        sinTamano: res.sinTamano,
        propuesto: Number(r.propuesto) || 0,
        aceptado: aceptadoFinal,
        banda: bandaFinal,
        justificacion: justificacionFinal,
        nota: r.nota,
      });
    });

    if (problemas.length) {
      setResultado({ ok: false, texto: problemas });
      return;
    }

    setGuardando(true);
    const supabase = createClient();
    const { id, error } = await guardarReciboEnDb(
      supabase,
      {
        folio: folio.trim(),
        fechaRecibo: fecha,
        contratista,
        obra,
        ot,
        prioridad,
        motivoPrioridad: motivo,
      },
      renglonesParaDb,
      "armado"
    );
    setGuardando(false);

    if (error || !id) {
      setResultado({ ok: false, texto: [error ?? "No se pudo guardar el recibo."] });
      return;
    }

    const nuevoRecibo: ReciboGuardado = {
      tipo: "armado",
      folio: folio.trim(),
      fecha,
      contratista,
      obra,
      ot,
      prioridad,
      motivo,
      guardadoEn: new Date().toISOString(),
      renglones: renglonesGuardados,
    };
    setReciboGuardado(nuevoRecibo);
    cargarHistoricoDb(supabase, "armado").then(setHistoricoDb);

    setResultado({
      ok: true,
      texto: [
        `Recibo ${nuevoRecibo.folio} guardado con ${renglones.length} renglones.`,
        sombras ? `${sombras} con estimado de nivel 3 guardado en sombra para calibrar.` : "",
        !puedeVerSugerido
          ? "Queda pendiente de que el desarrollador o el administrador de Estimaciones acepte o corrija los precios."
          : "",
        "Generando el PDF del recibo…",
      ].filter(Boolean),
    });

    // El PDF sale automáticamente al guardar; espera a que la ficha oculta
    // se monte con los datos nuevos antes de capturarla.
    window.setTimeout(() => {
      void generarPdfAutomatico(`recibo-armado-${nuevoRecibo.folio}.pdf`);
    }, 50);
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-6 pb-28">
      {!puedeVerSugerido && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
          Como capturista solo ves lo que propone el maquilador. El precio sugerido y la decisión de
          aceptar o corregirlo quedan para el desarrollador o el administrador de Estimaciones.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Recibo de Armado
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Captura lo que propone el maquilador; el motor sugiere el precio y de dónde sale.
          </p>
        </div>
        {puedeVerSugerido && (
          <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {nivel3Visible ? "Nivel 3 visible" : "Nivel 3 en sombra"}
          </span>
        )}
      </div>

      {/* ---------- Encabezado del recibo ---------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className={ETIQUETA}>Folio</span>
            <input
              className={`${CONTROL} font-mono`}
              value={folio}
              onChange={(e) => {
                setFolio(e.target.value);
                setNumeroInicial(1);
                setFolioContinuado(false);
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={ETIQUETA}>Fecha del recibo</span>
            <input
              type="date"
              className={CONTROL}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={ETIQUETA}>Contratista</span>
            <input
              className={CONTROL}
              value={contratista}
              onChange={(e) => setContratista(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={ETIQUETA}>Obra</span>
            <input
              list="dl-obras"
              className={CONTROL}
              value={obra}
              onChange={(e) => setObra(e.target.value)}
            />
            <datalist id="dl-obras">
              {OBRAS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className={ETIQUETA}>OT</span>
            <input
              list="dl-ots"
              className={`${CONTROL} font-mono`}
              value={ot}
              onChange={(e) => setOt(e.target.value)}
            />
            <datalist id="dl-ots">
              {OTS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className={ETIQUETA}>Prioridad</span>
            <SelectMenu
              value={prioridad}
              onChange={setPrioridad}
              opciones={[
                { value: "normal", label: "Normal" },
                { value: "preferente", label: "Preferente" },
                { value: "urgente", label: "Urgente" },
              ]}
            />
          </label>
          {prioridad !== "normal" && (
            <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
              <span className={ETIQUETA}>Motivo de la prioridad</span>
              <input
                className={CONTROL}
                placeholder="Por qué este recibo va con prioridad"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </label>
          )}
        </div>

        {folioPrevio.length > 0 && !folioContinuado && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <span>
              <strong>El folio {folio} ya existe</strong> con {folioPrevio.length} renglón
              {folioPrevio.length > 1 ? "es" : ""} capturado{folioPrevio.length > 1 ? "s" : ""} (
              {fechaCorta(folioPrevio[0].fecha)}, {folioPrevio[0].obra}).
            </span>
            <button
              type="button"
              onClick={continuarFolio}
              className="ml-auto rounded-md bg-amber-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-800"
            >
              Continuar este folio
            </button>
          </div>
        )}
        {folioContinuado && (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
            Continuando el folio <strong className="font-mono">{folio}</strong>. La numeración sigue
            desde el #{numeroInicial}.
          </div>
        )}
      </section>

      {/* ---------- Renglones ---------- */}
      <div className="flex flex-col gap-4">
        {renglones.map((r, idx) => {
          const res = resolver(aEntrada(r), recibo, cfg, historico);
          const esManual = res.fuente === "manual" || res.sombra;
          const sugerido = esManual ? null : res.pu;
          const b = bandaDe(sugerido, Number(r.propuesto) || 0, esManual);
          const aceptado =
            b.banda === "auto" && !r.tocadoAceptado ? Number(r.propuesto) || 0 : r.aceptado;
          const faltaJustificar = puedeVerSugerido && b.banda === "justificar" && !r.justificacion.trim();
          const importe = (Number(r.cantidad) || 0) * (Number(r.propuesto) || 0);

          return (
            <section
              key={r.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => alternarColapso(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    alternarColapso(r.id);
                  }
                }}
                className="flex cursor-pointer select-none items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 hover:bg-slate-100"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${
                    r.colapsado ? "-rotate-90" : ""
                  }`}
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.293l3.71-4.06a.75.75 0 1 1 1.11 1.01l-4.25 4.65a.75.75 0 0 1-1.11 0l-4.25-4.65a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="font-mono text-xs font-semibold text-slate-500">
                  #{numeroInicial + idx}
                </span>
                {r.colapsado && (
                  <span className="truncate text-sm text-slate-600">
                    {r.modelo || "sin modelo"} · {r.tipoArmado || "sin tipo de armado"} ·{" "}
                    {r.familia || "sin familia"} · {Number(r.cantidad) || 0} pz
                    {puedeVerSugerido && (
                      <>
                        {" · "}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${BANDA_ESTILO[b.banda]}`}
                        >
                          {BANDA_NOMBRE[b.banda]}
                        </span>
                      </>
                    )}
                    {" · "}
                    <span className="font-mono">{money(importe)}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    quitar(r.id);
                  }}
                  className="ml-auto text-xs font-medium text-slate-500 hover:text-rose-600"
                >
                  Quitar
                </button>
              </div>

              {!r.colapsado && (
                <div className={`grid gap-4 p-4 ${puedeVerSugerido ? "lg:grid-cols-[1.6fr_1fr]" : ""}`}>
                  {/* campos */}
                  <div className="flex flex-col gap-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="flex flex-col gap-1">
                        <span className={ETIQUETA}>Modelo</span>
                        <input
                          list="dl-modelos"
                          className={`${CONTROL} font-mono`}
                          value={r.modelo}
                          onChange={(e) => actualizar(r.id, { modelo: e.target.value })}
                          onBlur={() => {
                            const fams = CATALOGO.filter((c) => c.modelo === normalizar(r.modelo));
                            if (fams.length === 1 && !r.familia) {
                              actualizar(r.id, { familia: fams[0].familia });
                            }
                          }}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={ETIQUETA}>Tipo de armado</span>
                        <SelectMenu
                          value={r.tipoArmado}
                          onChange={(v) => actualizar(r.id, { tipoArmado: v })}
                          opciones={comoOpciones(TIPOS_ARMADO)}
                          vacio="— elegir —"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={ETIQUETA}>Familia</span>
                        <SelectMenu
                          value={r.familia}
                          onChange={(v) => actualizar(r.id, { familia: v })}
                          opciones={comoOpciones(FAMILIAS)}
                          vacio="— elegir —"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={ETIQUETA}>Tamaño</span>
                        <SelectMenu
                          value={r.tamano}
                          onChange={(v) => actualizar(r.id, { tamano: v })}
                          opciones={[
                            { value: "chico", label: "Chico" },
                            { value: "mediano", label: "Mediano" },
                            { value: "grande", label: "Grande" },
                          ]}
                          vacio="— sin definir —"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="flex flex-col gap-1">
                        <span className={ETIQUETA}>Trabajo</span>
                        <SelectMenu
                          value={r.tipoTrabajo}
                          onChange={(v) =>
                            actualizar(r.id, {
                              tipoTrabajo: v as Renglon["tipoTrabajo"],
                              causa: v === "produccion" ? "" : r.causa,
                            })
                          }
                          opciones={[
                            { value: "produccion", label: "Producción" },
                            { value: "reproceso", label: "Reproceso" },
                          ]}
                        />
                      </label>
                      {r.tipoTrabajo === "reproceso" && (
                        <label className="flex flex-col gap-1">
                          <span className={ETIQUETA}>Causa</span>
                          <SelectMenu
                            value={r.causa}
                            onChange={(v) => actualizar(r.id, { causa: v })}
                            opciones={comoOpciones(CAUSAS_REPROCESO)}
                            vacio="— elegir —"
                          />
                        </label>
                      )}
                      <label className="flex flex-col gap-1">
                        <span className={ETIQUETA}>Cantidad</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className={CONTROL}
                          value={r.cantidad}
                          onChange={(e) =>
                            actualizar(r.id, {
                              cantidad: e.target.value === "" ? "" : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span className={ETIQUETA}>Nota</span>
                      <input
                        className={CONTROL}
                        value={r.nota}
                        onChange={(e) => actualizar(r.id, { nota: e.target.value })}
                      />
                    </label>

                    {!puedeVerSugerido && (
                      <label className="flex max-w-xs flex-col gap-1">
                        <span className={ETIQUETA}>Precio propuesto por el maquilador</span>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          className={`${CONTROL} tabular-nums`}
                          value={r.propuesto}
                          onChange={(e) =>
                            actualizar(r.id, {
                              propuesto: e.target.value === "" ? "" : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    )}
                  </div>

                  {/* veredicto — solo desarrollador / admin de Estimaciones */}
                  {puedeVerSugerido && (
                    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div
                        className={`text-3xl font-semibold tracking-tight tabular-nums ${
                          sugerido == null ? "text-slate-400" : "text-slate-900"
                        }`}
                      >
                        {sugerido == null ? "Sin sugerencia" : money(sugerido)}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {FUENTE_NOMBRE[esManual ? "manual" : res.fuente]}
                      </div>
                      <div className="text-xs text-slate-500">
                        {esManual
                          ? res.sombra
                            ? "El estimado por familia aún no se muestra: fija el precio y justifícalo."
                            : !r.familia || r.familia === "Otro"
                              ? "Sin tarifa para esta familia. Fija el precio y justifícalo."
                              : "Sin tarifa ni precedente. Fija el precio y justifícalo."
                          : res.detalle}
                      </div>

                      <div className="mt-1 flex items-end gap-2">
                        <label className="flex flex-1 flex-col gap-1">
                          <span className={ETIQUETA}>Propuesto</span>
                          <input
                            type="number"
                            min={0}
                            step={10}
                            className={`${CONTROL} tabular-nums`}
                            value={r.propuesto}
                            onChange={(e) =>
                              actualizar(r.id, {
                                propuesto: e.target.value === "" ? "" : Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          title="Copiar propuesto a aceptado"
                          onClick={() =>
                            actualizar(r.id, {
                              aceptado: Number(r.propuesto) || 0,
                              tocadoAceptado: true,
                            })
                          }
                          className="mb-0.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                        >
                          →
                        </button>
                        <label className="flex flex-1 flex-col gap-1">
                          <span className={ETIQUETA}>Aceptado</span>
                          <input
                            type="number"
                            min={0}
                            step={10}
                            className={`${CONTROL} tabular-nums`}
                            value={aceptado}
                            onChange={(e) =>
                              actualizar(r.id, {
                                aceptado: e.target.value === "" ? "" : Number(e.target.value),
                                tocadoAceptado: true,
                              })
                            }
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2.5 py-1 text-xs font-semibold ring-1 ${BANDA_ESTILO[b.banda]}`}
                        >
                          {BANDA_NOMBRE[b.banda]}
                        </span>
                        {b.dif != null && (
                          <span className="text-xs tabular-nums text-slate-500">
                            {b.dif >= 0 ? "+" : ""}
                            {(b.dif * 100).toFixed(1)}% vs sugerido
                          </span>
                        )}
                        <span className="ml-auto font-mono text-sm font-semibold text-slate-900">
                          {money((Number(r.cantidad) || 0) * (Number(aceptado) || 0))}
                        </span>
                      </div>

                      {b.banda === "justificar" && (
                        <div className="flex flex-col gap-1">
                          <textarea
                            rows={2}
                            placeholder="Por qué se acepta este precio"
                            className={`${CONTROL} ${faltaJustificar ? "border-rose-300" : ""}`}
                            value={r.justificacion}
                            onChange={(e) => actualizar(r.id, { justificacion: e.target.value })}
                          />
                          {faltaJustificar && (
                            <span className="text-[11px] text-rose-600">
                              Sin justificación no se puede guardar este renglón.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <datalist id="dl-modelos">
        {MODELOS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div>
        <button
          type="button"
          onClick={() => {
            setRenglones((prev) => [...prev, nuevoRenglon()]);
            setResultado(null);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          + Agregar renglón
        </button>
      </div>

      {resultado && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            resultado.ok
              ? "border-indigo-200 bg-indigo-50 text-indigo-900"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <strong>{resultado.ok ? "Recibo guardado" : "No se guardó"}</strong>
          <ul className="mt-1 list-inside list-disc">
            {resultado.texto.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          {reciboGuardado && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link
                href={`/estimaciones/recibos/armado/recibo/${encodeURIComponent(reciboGuardado.folio)}`}
                className="text-xs font-semibold text-indigo-700 hover:underline"
              >
                Ver ficha de seguimiento →
              </Link>
              {!generandoPdf && (
                <DescargarPdfButton
                  nombreArchivo={`recibo-armado-${reciboGuardado.folio}.pdf`}
                  selector="[data-ficha-oculta] [data-informe]"
                  etiqueta="Descargar PDF de nuevo"
                />
              )}
              {generandoPdf && <span className="text-xs text-slate-500">Generando PDF…</span>}
            </div>
          )}
        </div>
      )}

      {/* Ficha fuera de pantalla: se usa solo para capturar el PDF (no se ve). */}
      {reciboGuardado && (
        <div
          data-ficha-oculta
          ref={fichaOcultaRef}
          className="pointer-events-none fixed left-0 top-0 -z-10 opacity-0"
          aria-hidden="true"
        >
          <ReciboFichaArmado
            recibo={reciboGuardado}
            qrUrl={
              typeof window !== "undefined"
                ? `${window.location.origin}/estimaciones/recibos/armado/recibo/${encodeURIComponent(reciboGuardado.folio)}`
                : ""
            }
          />
        </div>
      )}

      {/* ---------- Parámetros del motor ---------- */}
      {puedeVerSugerido && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setParametrosAbiertos((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900"
          >
            Parámetros del motor
            <span className="text-slate-400">{parametrosAbiertos ? "−" : "+"}</span>
          </button>
          {parametrosAbiertos && (
            <div className="flex flex-col gap-4 border-t border-slate-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={nivel3Visible}
                    onChange={(e) => setNivel3Visible(e.target.checked)}
                  />
                  Mostrar el nivel 3 (estimado por familia)
                </label>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className={ETIQUETA}>Tarifa de proyecto — modelo</span>
                  <input
                    className={`${CONTROL} font-mono`}
                    value={tpModelo}
                    onChange={(e) => setTpModelo(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={ETIQUETA}>Precio</span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    className={`${CONTROL} tabular-nums`}
                    value={tpTarifa}
                    onChange={(e) => setTpTarifa(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={agregarTarifaProyecto}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Fijar para esta OT
                </button>
                <p className="w-full text-xs text-slate-500">
                  {tarifasProyecto.length
                    ? tarifasProyecto
                        .map((t) => `${t.modelo} → ${money(t.tarifa)} (OT ${t.ot})`)
                        .join(" · ")
                    : "Sin tarifas de proyecto. Fija una para ver el nivel 0 en acción."}
                </p>
              </div>

              {Object.keys(TARIFAS_FIJAS_ARMADO).length + Object.keys(TARIFAS_BASE_ARMADO).length === 0 && (
                <p className="text-xs text-slate-500">
                  Armado todavía no tiene tarifas propias: el precio sugerido sale solo de precedentes
                  (mismo modelo y tipo de armado). Sin precedente, el precio se fija y se justifica.
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <TablaParametro
                  titulo="Tarifas fijas"
                  filas={Object.entries(TARIFAS_FIJAS_ARMADO).map(([k, v]) => [k, money(v)])}
                />
                <TablaParametro
                  titulo="Tarifas base por familia"
                  filas={Object.entries(TARIFAS_BASE_ARMADO).map(([k, v]) => [k, money(v)])}
                />
                <TablaParametro
                  titulo="Escalón de volumen"
                  filas={VOLUMEN.map((v) => [v.clave, v.valor.toFixed(2)])}
                />
                <TablaParametro
                  titulo="Prioridad"
                  filas={Object.entries(PRIORIDAD).map(([k, v]) => [k, v.toFixed(2)])}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------- Totales ---------- */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-6 py-3 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Total etiqueta="Renglones" valor={String(renglones.length)} />
          <Total etiqueta="Propuesto" valor={money(totales.propuesto)} />
          {puedeVerSugerido && (
            <>
              <Total etiqueta="Aceptado" valor={money(totales.aceptado)} />
              <Total
                etiqueta="Recorte"
                valor={`${money(recorte)}${totales.propuesto > 0 ? `  (${recortePct.toFixed(1)}%)` : ""}`}
                destacado
              />
            </>
          )}
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando}
            className="ml-auto rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar recibo"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Total({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className={ETIQUETA}>{etiqueta}</span>
      <span
        className={`font-mono text-sm font-semibold tabular-nums ${
          destacado ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {valor}
      </span>
    </div>
  );
}

function TablaParametro({ titulo, filas }: { titulo: string; filas: string[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {titulo}
      </div>
      <table className="w-full text-left text-xs">
        <tbody className="divide-y divide-slate-100">
          {filas.map(([k, v]) => (
            <tr key={k}>
              <td className="px-3 py-1.5 text-slate-700">{k}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-900">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
