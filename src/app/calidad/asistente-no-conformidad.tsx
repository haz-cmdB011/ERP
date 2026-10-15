"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SelectorMotivo from "@/app/calidad/selector-motivo";
import { CATEGORIAS_DEFECTO, type CategoriaDefecto } from "@/lib/calidad/categorias";
import { cargarCatalogosCalidad } from "@/lib/calidad/catalogos-calidad";
import { leerPiezas } from "@/lib/calidad/lotes";
import { accionesSugeridas, motivosMasUsados } from "@/lib/calidad/motivos";
import {
  DETALLE_VACIO,
  MAX_FOTOS_INFORME,
  TIPOS_REPORTE,
  TIPO_PROBLEMA_LABELS,
  TIPO_REPORTE_POR_DEFECTO,
  deteccionSugerida,
  nombresDeAreas,
  origenSugerido,
  responsablesDeArea,
  type CatalogosCalidad,
  type DetalleNoConformidad,
  type OrigenLote,
} from "@/lib/calidad/no-conformidad";
import { createClient } from "@/lib/supabase/client";

export interface ResultadoAsistente {
  aprobadas: number;
  rechazadas: number;
  // Motivo del rechazo: el nombre del motivo del catálogo y, si se escribió, el comentario.
  descripcion: string;
  categoria: CategoriaDefecto | "";
  detalle: DetalleNoConformidad;
  fotos: File[];
}

type Paso = "resultado" | "fotos" | "motivo" | "origen" | "accion";

const TITULOS_PASO: Record<Paso, string> = {
  resultado: "¿Qué resultado tiene?",
  fotos: "Foto de la no conformidad",
  motivo: "¿Cuál es el motivo?",
  origen: "¿Dónde y de dónde viene?",
  accion: "¿Qué se va a hacer?",
};

const campo =
  "min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-slate-400 focus:outline-none disabled:bg-slate-100";
const botonGrande =
  "flex min-h-12 items-center justify-center rounded-lg px-4 text-base font-medium transition-colors disabled:opacity-50";

function Contador({
  etiqueta,
  texto,
  onCambio,
  max,
}: {
  etiqueta: string;
  texto: string;
  onCambio: (t: string) => void;
  max: number;
}) {
  const n = leerPiezas(texto);
  const mover = (d: number) => onCambio(String(Math.min(max, Math.max(0, (Number.isFinite(n) ? n : 0) + d))));
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-700">{etiqueta}</span>
      <div className="flex items-stretch gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label={`Menos ${etiqueta}`} className={`${botonGrande} w-14 border border-slate-300 bg-white text-2xl text-slate-700 active:bg-slate-100`}>
          −
        </button>
        <input
          inputMode="decimal"
          value={texto}
          onChange={(e) => onCambio(e.target.value)}
          aria-label={etiqueta}
          className={`${campo} text-center text-xl font-semibold`}
        />
        <button type="button" onClick={() => mover(1)} aria-label={`Más ${etiqueta}`} className={`${botonGrande} w-14 border border-slate-300 bg-white text-2xl text-slate-700 active:bg-slate-100`}>
          +
        </button>
      </div>
    </div>
  );
}

// Una tarjeta con el área y el responsable ya sugeridos; "Cambiar" abre los
// selectores. Si falta algo, se abre sola.
function TarjetaLugar({
  titulo,
  area,
  responsable,
  areas,
  onArea,
  onResponsable,
}: {
  titulo: string;
  area: string;
  responsable: string;
  areas: CatalogosCalidad["areas"];
  onArea: (a: string) => void;
  onResponsable: (r: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const completa = Boolean(area && responsable);
  const editando = abierta || !completa;
  const responsables = area ? responsablesDeArea(areas, area) : [];

  return (
    <div className="rounded-lg border border-slate-300 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
        {completa && (
          <button type="button" onClick={() => setAbierta(!abierta)} className="min-h-9 px-2 text-sm font-medium text-brand-700">
            {abierta ? "Listo" : "Cambiar"}
          </button>
        )}
      </div>
      {!editando ? (
        <p className="mt-1 text-base font-medium text-slate-900">
          {area} <span className="text-slate-500">·</span> {responsable}
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <select value={area} onChange={(e) => onArea(e.target.value)} aria-label={`${titulo}: área`} className={campo}>
            <option value="">Elegir área…</option>
            {nombresDeAreas(areas).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {responsables.length > 0 ? (
            <select value={responsable} onChange={(e) => onResponsable(e.target.value)} aria-label={`${titulo}: responsable`} className={campo}>
              <option value="">Elegir responsable…</option>
              {responsable && !responsables.includes(responsable) && <option value={responsable}>{responsable}</option>}
              {responsables.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          ) : (
            <input
              value={responsable}
              onChange={(e) => onResponsable(e.target.value)}
              disabled={!area}
              maxLength={120}
              placeholder={area ? "Sin responsable fijo: escribe el nombre" : "Elige primero el área"}
              aria-label={`${titulo}: responsable`}
              className={campo}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface FotoElegida {
  archivo: File;
  url: string;
}

// Asistente para registrar una no conformidad desde el celular o la tableta:
// pantalla completa, un paso a la vez, botones grandes y lo posible ya relleno
// (tipo de reporte, área de detección y, en un lote, el origen). Con lote
// empieza por el resultado (cuántas piezas se aprueban y cuántas se rechazan);
// aprobar todo es un solo toque. Solución, material, severidad y causa raíz se
// completan después desde el informe.
export default function AsistenteNoConformidad({
  titulo,
  subtitulo,
  lote = null,
  origenLote = null,
  enviando,
  error,
  onCancelar,
  onEnviar,
}: {
  titulo: string;
  subtitulo?: string;
  // Con lote se pregunta primero el resultado; sin lote es un rechazo directo.
  lote?: { pendiente: number; unidad: string | null } | null;
  origenLote?: OrigenLote | null;
  enviando: boolean;
  error: string | null;
  onCancelar: () => void;
  onEnviar: (r: ResultadoAsistente) => void;
}) {
  const unidad = lote?.unidad ?? "pz";
  const [catalogos, setCatalogos] = useState<CatalogosCalidad | null>(null);
  const [errorCatalogos, setErrorCatalogos] = useState<string | null>(null);
  const [codigosRecientes, setCodigosRecientes] = useState<(string | null)[]>([]);
  const [acciones, setAcciones] = useState<string[]>([]);

  const [paso, setPaso] = useState<Paso>(lote ? "resultado" : "fotos");
  const [aprobadasTxt, setAprobadasTxt] = useState(lote ? String(lote.pendiente) : "0");
  const [rechazadasTxt, setRechazadasTxt] = useState("0");
  const [fotos, setFotos] = useState<FotoElegida[]>([]);
  const [cambios, setCambios] = useState<Partial<DetalleNoConformidad>>({});
  const [cambiandoMotivo, setCambiandoMotivo] = useState(false);
  const [comentario, setComentario] = useState("");
  const [categoria, setCategoria] = useState<CategoriaDefecto | "">("");

  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  });
  // Libera las vistas previas al cerrar.
  useEffect(() => {
    return () => fotosRef.current.forEach((f) => URL.revokeObjectURL(f.url));
  }, []);

  useEffect(() => {
    let vivo = true;
    cargarCatalogosCalidad().then(
      (c) => vivo && setCatalogos(c),
      (e: Error) => vivo && setErrorCatalogos(e.message)
    );
    createClient()
      .from("informes_calidad")
      .select("motivo_codigo")
      .not("motivo_codigo", "is", null)
      .order("elaborado_en", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (vivo) setCodigosRecientes(((data ?? []) as { motivo_codigo: string | null }[]).map((r) => r.motivo_codigo));
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Lo sugerido (no se escribe en el estado: lo que cambie quien captura lo tapa).
  const sugerido = useMemo<Partial<DetalleNoConformidad>>(() => {
    if (!catalogos) return {};
    return {
      tipoReporte: TIPO_REPORTE_POR_DEFECTO,
      ...(deteccionSugerida(catalogos.areas) ?? {}),
      ...(origenLote ? (origenSugerido(origenLote, catalogos.areas) ?? {}) : {}),
    };
  }, [catalogos, origenLote]);
  const detalle: DetalleNoConformidad = { ...DETALLE_VACIO, ...sugerido, ...cambios };
  const cambiar = (parcial: Partial<DetalleNoConformidad>) => setCambios((c) => ({ ...c, ...parcial }));

  const motivo = catalogos?.motivos.find((m) => m.codigo === detalle.motivoCodigo) ?? null;
  const masUsados = useMemo(
    () =>
      catalogos
        ? motivosMasUsados(codigosRecientes)
            .map((c) => catalogos.motivos.find((m) => m.codigo === c))
            .filter((m): m is NonNullable<typeof m> => !!m)
        : [],
    [catalogos, codigosRecientes]
  );

  // Acciones que ya se usaron con este motivo.
  const codigoMotivo = detalle.motivoCodigo;
  useEffect(() => {
    if (!codigoMotivo) return;
    let vivo = true;
    createClient()
      .from("informes_calidad")
      .select("acciones_correctivas")
      .eq("motivo_codigo", codigoMotivo)
      .not("acciones_correctivas", "is", null)
      .order("elaborado_en", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (vivo) setAcciones(accionesSugeridas(((data ?? []) as { acciones_correctivas: string | null }[]).map((r) => r.acciones_correctivas)));
      });
    return () => {
      vivo = false;
    };
  }, [codigoMotivo]);

  const nAprob = leerPiezas(aprobadasTxt);
  const nRech = leerPiezas(rechazadasTxt);
  const pasos: Paso[] = lote
    ? nRech > 0
      ? ["resultado", "fotos", "motivo", "origen", "accion"]
      : ["resultado"]
    : ["fotos", "motivo", "origen", "accion"];
  const indice = pasos.indexOf(paso);
  const esUltimo = indice === pasos.length - 1;

  // Qué falta para pasar al siguiente paso (null = se puede seguir).
  function falta(p: Paso): string | null {
    if (p === "resultado") {
      if (!Number.isFinite(nAprob) || !Number.isFinite(nRech)) return "Escribe cantidades válidas.";
      if (nAprob + nRech <= 0) return "Indica cuántas piezas apruebas o rechazas.";
      if (lote && Math.round((nAprob + nRech) * 100) / 100 > lote.pendiente) return `El lote solo tiene ${lote.pendiente} por evaluar.`;
    }
    if (p === "motivo" && !motivo) return "Elige un motivo de la lista.";
    if (p === "origen") {
      if (!detalle.tipoReporte) return "Elige el tipo de reporte.";
      if (!detalle.areaDeteccion || !detalle.responsableDeteccion) return "Falta el área y el responsable donde se detectó.";
      if (!detalle.areaOrigen || !detalle.responsableOrigen) return "Falta el área y el responsable de origen.";
    }
    if (p === "accion") {
      if (!detalle.accionesCorrectivas.trim()) return "Escribe qué se va a hacer para corregirlo.";
      if (!lote) {
        const n = Number(detalle.piezasAfectadas.replace(",", "."));
        if (!Number.isFinite(n) || n <= 0) return "Indica cuántas piezas están afectadas.";
      }
    }
    return null;
  }
  const pendiente = falta(paso);

  function avanzar() {
    if (pendiente) return;
    if (!esUltimo) {
      setPaso(pasos[indice + 1]);
      return;
    }
    onEnviar({
      aprobadas: Number.isFinite(nAprob) ? nAprob : 0,
      rechazadas: lote ? nRech : 1,
      descripcion: `${motivo?.nombre ?? ""}${comentario.trim() ? ` — ${comentario.trim()}` : ""}`.slice(0, 500),
      categoria,
      detalle,
      fotos: fotos.map((f) => f.archivo),
    });
  }

  // "Aprobar todo" en un lote: un solo toque, sin más pasos.
  function enviarAprobacion() {
    if (pendiente) return;
    onEnviar({ aprobadas: nAprob, rechazadas: 0, descripcion: "", categoria: "", detalle, fotos: [] });
  }

  function retroceder() {
    if (indice > 0) setPaso(pasos[indice - 1]);
  }

  function cerrar() {
    if (enviando) return;
    const avance = fotos.length > 0 || Boolean(motivo) || (paso !== "resultado" && paso !== "fotos");
    if (avance && !window.confirm("¿Descartar este reporte? Se perderá lo capturado.")) return;
    onCancelar();
  }

  const cerrarRef = useRef(cerrar);
  useEffect(() => {
    cerrarRef.current = cerrar;
  });
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarRef.current();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  function agregarFotos(lista: FileList | null) {
    if (!lista) return;
    const cupo = MAX_FOTOS_INFORME - fotos.length;
    const nuevas = Array.from(lista)
      .slice(0, Math.max(cupo, 0))
      .map((archivo) => ({ archivo, url: URL.createObjectURL(archivo) }));
    setFotos((f) => [...f, ...nuevas]);
  }

  function quitarFoto(url: string) {
    URL.revokeObjectURL(url);
    setFotos((f) => f.filter((x) => x.url !== url));
  }

  function elegirArea(cual: "Deteccion" | "Origen", area: string) {
    const unico = catalogos ? responsablesDeArea(catalogos.areas, area) : [];
    cambiar(
      cual === "Deteccion"
        ? { areaDeteccion: area, responsableDeteccion: unico.length === 1 ? unico[0] : "" }
        : { areaOrigen: area, responsableOrigen: unico.length === 1 ? unico[0] : "" }
    );
  }

  const todoAprobado = lote !== null && nRech === 0 && nAprob === lote.pendiente;
  const todoRechazado = lote !== null && nAprob === 0 && nRech === lote.pendiente;
  const aprobando = paso === "resultado" && nRech === 0;

  // En el body, para que ningún contenedor de la página lo recorte.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-scrim/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div className="flex h-dvh w-full flex-col bg-white sm:h-auto sm:max-h-[92vh] sm:max-w-xl sm:rounded-xl sm:shadow-lg">
        <header className="border-b border-slate-200 px-4 pb-3 pt-3">
          <div className="flex items-center gap-2">
            {indice > 0 ? (
              <button type="button" onClick={retroceder} aria-label="Paso anterior" className="flex size-11 items-center justify-center rounded-full text-xl text-slate-700 active:bg-slate-100">
                ←
              </button>
            ) : (
              <span className="size-11" aria-hidden />
            )}
            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-sm font-semibold text-slate-900">{titulo}</h2>
              {subtitulo && <p className="truncate text-xs text-slate-500">{subtitulo}</p>}
            </div>
            <button type="button" onClick={cerrar} aria-label="Cerrar" disabled={enviando} className="flex size-11 items-center justify-center rounded-full text-xl text-slate-700 active:bg-slate-100 disabled:opacity-40">
              ✕
            </button>
          </div>
          {pasos.length > 1 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1" aria-hidden>
                {pasos.map((p, i) => (
                  <span key={p} className={`h-1.5 flex-1 rounded-full ${i <= indice ? "bg-brand-500" : "bg-slate-200"}`} />
                ))}
              </div>
              <span className="text-xs text-slate-500">
                Paso {indice + 1} de {pasos.length}
              </span>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">{TITULOS_PASO[paso]}</h3>

          {errorCatalogos && (
            <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              No se pudieron cargar los catálogos de Calidad: {errorCatalogos}
            </p>
          )}

          {paso === "resultado" && lote && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-slate-600">
                Por evaluar: <strong>{lote.pendiente}</strong> {unidad}. Cada resultado genera su propio folio permanente.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAprobadasTxt(String(lote.pendiente));
                    setRechazadasTxt("0");
                  }}
                  aria-pressed={todoAprobado}
                  className={`${botonGrande} min-h-16 flex-col gap-0.5 border-2 ${todoAprobado ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  <span className="text-xl" aria-hidden>✓</span>
                  Todo aprobado
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAprobadasTxt("0");
                    setRechazadasTxt(String(lote.pendiente));
                  }}
                  aria-pressed={todoRechazado}
                  className={`${botonGrande} min-h-16 flex-col gap-0.5 border-2 ${todoRechazado ? "border-rose-600 bg-rose-50 text-rose-800" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  <span className="text-xl" aria-hidden>✗</span>
                  Todo rechazado
                </button>
              </div>
              {lote.pendiente > 1 && (
                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">O divide el lote</p>
                  <Contador
                    etiqueta="Rechazadas"
                    texto={rechazadasTxt}
                    max={lote.pendiente}
                    onCambio={(t) => {
                      setRechazadasTxt(t);
                      const n = leerPiezas(t);
                      if (Number.isFinite(n)) setAprobadasTxt(String(Math.max(0, Math.round((lote.pendiente - n) * 100) / 100)));
                    }}
                  />
                  <Contador etiqueta="Aprobadas" texto={aprobadasTxt} max={lote.pendiente} onCambio={setAprobadasTxt} />
                </div>
              )}
            </div>
          )}

          {paso === "fotos" && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-slate-600">Toma una foto del problema. Puedes agregar más o hacerlo después desde el informe.</p>
              <div className="grid grid-cols-2 gap-3">
                <label className={`${botonGrande} cursor-pointer gap-2 bg-brand-500 text-on-brand active:bg-brand-400 ${fotos.length >= MAX_FOTOS_INFORME ? "pointer-events-none opacity-50" : ""}`}>
                  <span aria-hidden>📷</span> Tomar foto
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      agregarFotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className={`${botonGrande} cursor-pointer gap-2 border border-slate-300 bg-white text-slate-700 active:bg-slate-100 ${fotos.length >= MAX_FOTOS_INFORME ? "pointer-events-none opacity-50" : ""}`}>
                  <span aria-hidden>🖼️</span> Galería
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      agregarFotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {fotos.length > 0 && (
                <>
                  <p className="text-xs text-slate-500">
                    {fotos.length} de {MAX_FOTOS_INFORME} fotos
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {fotos.map((f, i) => (
                      <div key={f.url} className="relative aspect-square overflow-hidden rounded-lg border border-slate-300">
                        {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob) */}
                        <img src={f.url} alt={`Foto ${i + 1}`} className="size-full object-cover" />
                        <button
                          type="button"
                          onClick={() => quitarFoto(f.url)}
                          aria-label={`Quitar foto ${i + 1}`}
                          className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-slate-900/70 text-white"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {paso === "motivo" && catalogos && (
            <>
              {motivo && !cambiandoMotivo ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                        {motivo.codigo} · {TIPO_PROBLEMA_LABELS[motivo.tipo]}
                      </p>
                      <button type="button" onClick={() => setCambiandoMotivo(true)} className="min-h-9 px-2 text-sm font-medium text-brand-700">
                        Cambiar
                      </button>
                    </div>
                    <p className="mt-1 text-base font-semibold text-slate-900">{motivo.nombre}</p>
                  </div>
                  <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                    Comentario (opcional)
                    <textarea
                      rows={3}
                      maxLength={300}
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      placeholder="Algo que ayude a entenderlo (puedes dictarlo con el micrófono del teclado)"
                      className={`${campo} py-2`}
                    />
                  </label>
                  <details className="rounded-lg border border-slate-200 p-3">
                    <summary className="min-h-9 cursor-pointer text-sm font-medium text-slate-700">Tipo de defecto (opcional)</summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CATEGORIAS_DEFECTO.map((c) => (
                        <button
                          key={c.valor}
                          type="button"
                          aria-pressed={categoria === c.valor}
                          onClick={() => setCategoria(categoria === c.valor ? "" : c.valor)}
                          className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                            categoria === c.valor ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-300 text-slate-600"
                          }`}
                        >
                          {c.nombre}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              ) : (
                <SelectorMotivo
                  motivos={catalogos.motivos}
                  masUsados={masUsados}
                  onElegir={(m) => {
                    cambiar({ motivoCodigo: m.codigo });
                    setAcciones([]);
                    setCambiandoMotivo(false);
                  }}
                />
              )}
            </>
          )}
          {paso === "motivo" && !catalogos && !errorCatalogos && <p className="text-sm text-slate-500">Cargando motivos…</p>}

          {paso === "origen" && catalogos && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">Tipo de reporte</p>
                <div className="flex flex-wrap gap-2">
                  {TIPOS_REPORTE.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={detalle.tipoReporte === t}
                      onClick={() => cambiar({ tipoReporte: t })}
                      className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                        detalle.tipoReporte === t ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-300 text-slate-600"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <TarjetaLugar
                titulo="Se detectó en"
                area={detalle.areaDeteccion}
                responsable={detalle.responsableDeteccion}
                areas={catalogos.areas}
                onArea={(a) => elegirArea("Deteccion", a)}
                onResponsable={(r) => cambiar({ responsableDeteccion: r })}
              />
              <TarjetaLugar
                titulo="Origen de la no conformidad"
                area={detalle.areaOrigen}
                responsable={detalle.responsableOrigen}
                areas={catalogos.areas}
                onArea={(a) => elegirArea("Origen", a)}
                onResponsable={(r) => cambiar({ responsableOrigen: r })}
              />
              {origenLote && <p className="text-xs text-slate-500">El origen se propuso con el equipo que entregó el lote ({origenLote.equipo}).</p>}
            </div>
          )}

          {paso === "accion" && (
            <div className="flex flex-col gap-4">
              {motivo && (
                <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                  <strong>{motivo.nombre}</strong> · {detalle.areaOrigen} · {fotos.length} foto{fotos.length === 1 ? "" : "s"}
                </p>
              )}
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Acciones correctivas
                <textarea
                  rows={4}
                  maxLength={1000}
                  value={detalle.accionesCorrectivas}
                  onChange={(e) => cambiar({ accionesCorrectivas: e.target.value })}
                  placeholder="Qué se va a hacer para corregirlo"
                  className={`${campo} py-2`}
                />
              </label>
              {acciones.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Usadas antes con este motivo</p>
                  <div className="flex flex-col gap-2">
                    {acciones.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => cambiar({ accionesCorrectivas: detalle.accionesCorrectivas.trim() ? `${detalle.accionesCorrectivas.trim()}\n${a}` : a })}
                        className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 active:bg-slate-100"
                      >
                        + {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!lote && (
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Piezas afectadas
                  <input inputMode="decimal" value={detalle.piezasAfectadas} onChange={(e) => cambiar({ piezasAfectadas: e.target.value })} className={campo} />
                </label>
              )}
              <p className="text-xs text-slate-500">La solución, el material, la severidad y la causa raíz se completan después desde el informe.</p>
            </div>
          )}
        </div>

        <footer className="border-t border-slate-200 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {error && (
            <p role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {pendiente && paso !== "resultado" && <p className="mb-2 text-center text-xs text-slate-500">{pendiente}</p>}
          <button
            type="button"
            onClick={aprobando ? enviarAprobacion : avanzar}
            disabled={enviando || Boolean(pendiente)}
            className={`${botonGrande} w-full ${aprobando ? "bg-emerald-600 text-white active:bg-emerald-700" : "bg-brand-500 text-on-brand active:bg-brand-400"}`}
          >
            {enviando
              ? "Generando folio…"
              : aprobando
                ? `Aprobar ${Number.isFinite(nAprob) ? nAprob : 0} ${unidad}`
                : esUltimo
                  ? "Generar informe"
                  : "Siguiente"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
