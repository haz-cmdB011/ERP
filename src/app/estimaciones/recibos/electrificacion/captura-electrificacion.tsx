"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SelectMenu from "@/components/select-menu";
import { createClient } from "@/lib/supabase/client";
import { OBRAS, PRIORIDAD, VOLUMEN } from "@/lib/estimaciones/datos-acabados";
import {
  BANDA_NOMBRE,
  bandaDe,
  fechaCorta,
  money,
  normalizar,
  type Banda,
} from "@/lib/estimaciones/motor-precio";
import {
  CATEGORIA_NOMBRE,
  CATEGORIA_RANGO,
  COMPLEJIDAD_NOMBRE,
  FUENTE_ELECTRIFICACION_NOMBRE,
  TARIFAS_ELECTRIFICACION_INICIALES,
  categoriaCharola,
  resolverElectrificacion,
  type CategoriaCharola,
  type ComplejidadLed,
  type TarifasElectrificacion,
} from "@/lib/estimaciones/motor-electrificacion";
import {
  guardarReciboElectrificacionEnDb,
  listarFoliosElectrificacion,
  listarModelosOtElectrificacion,
  listarOtsElectrificacion,
  modificarReciboElectrificacionEnDb,
  type FolioElectrificacionExistente,
  type ModeloOtElectrificacion,
  type OtElectrificacion,
  type ReciboElectrificacionGuardado,
  type RenglonElectrificacionGuardado,
  type RenglonElectrificacionParaGuardar,
} from "@/lib/estimaciones/recibos-electrificacion-db";
import {
  claveModelo,
  claveOt,
  conciliarRenglones,
  requiereMotivo,
} from "@/lib/estimaciones/conciliacion-pm";
import DialogoDescuadres, {
  AVISO_DESCUADRE_CAMBIO,
  esErrorDeDescuadre,
  type Descuadre,
} from "../dialogo-descuadres";
import { generarPdfDesdeElemento } from "../acabados/generar-pdf";
import DescargarPdfButton from "../acabados/descargar-pdf-button";
import ReciboFichaElectrificacion from "./recibo-ficha-electrificacion";
import { avisar } from "@/components/avisos";

interface Charola {
  drivers: number | "";
}

interface Renglon {
  id: number;
  modelo: string;
  cantidad: number | "";
  metrosLed: number | "";
  complejidadLed: ComplejidadLed | "";
  charolas: Charola[];
  propuesto: number | "";
  aceptado: number | "";
  justificacion: string;
  nota: string;
  tocadoAceptado: boolean;
  colapsado: boolean;
  // Motivo que explica por qué la cantidad no concuerda con el PM (se pide al guardar).
  motivoDescuadre: string;
}

let seq = 0;
function nuevoRenglon(pre: Partial<Renglon> = {}): Renglon {
  seq += 1;
  return {
    id: seq,
    modelo: "",
    cantidad: 1,
    metrosLed: 0,
    complejidadLed: "",
    charolas: [],
    propuesto: 0,
    aceptado: 0,
    justificacion: "",
    nota: "",
    tocadoAceptado: false,
    colapsado: false,
    motivoDescuadre: "",
    ...pre,
  };
}

const BANDA_ESTILO: Record<string, string> = {
  auto: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  estimador: "bg-amber-50 text-amber-700 ring-amber-200",
  justificar: "bg-rose-50 text-rose-700 ring-rose-200",
};

const CATEGORIA_ESTILO: Record<CategoriaCharola, string> = {
  sencilla: "bg-sky-50 text-sky-700 ring-sky-200",
  intermedia: "bg-violet-50 text-violet-700 ring-violet-200",
  compleja: "bg-orange-50 text-orange-700 ring-orange-200",
};

const ETIQUETA = "text-[11px] font-medium uppercase tracking-wide text-slate-500";
const CONTROL =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 " +
  "focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const OPCIONES_COMPLEJIDAD = (Object.keys(COMPLEJIDAD_NOMBRE) as ComplejidadLed[]).map((k) => ({
  value: k,
  label: COMPLEJIDAD_NOMBRE[k],
}));

function renglonDesdeGuardado(rg: RenglonElectrificacionGuardado): Renglon {
  return nuevoRenglon({
    modelo: rg.modelo,
    cantidad: rg.cantidad,
    metrosLed: rg.metrosLed,
    complejidadLed: rg.complejidadLed,
    charolas: rg.charolas.map((c) => ({ drivers: c.drivers })),
    propuesto: rg.propuesto,
    nota: rg.nota,
  });
}

// contratistaFijo: solo cuando captura un maquilador. Su contratista sale de
// su usuario y no se edita (la base además lo fuerza al guardar).
// reciboExistente: modo edición — el maquilador está modificando un recibo
// pendiente que ya capturó (en vez de cancelarlo y capturarlo de nuevo). El
// folio no se puede cambiar; los renglones se reemplazan por completo.
export default function CapturaElectrificacion({
  puedeVerSugerido,
  contratistaFijo = null,
  reciboExistente = null,
}: {
  puedeVerSugerido: boolean;
  contratistaFijo?: string | null;
  reciboExistente?: ReciboElectrificacionGuardado | null;
}) {
  const [renglones, setRenglones] = useState<Renglon[]>(() =>
    reciboExistente ? reciboExistente.renglones.map(renglonDesdeGuardado) : [nuevoRenglon()]
  );

  const [folio, setFolio] = useState(reciboExistente?.folio ?? "");
  const [fecha, setFecha] = useState(reciboExistente?.fecha ?? "");
  const [contratista, setContratista] = useState(
    contratistaFijo ?? reciboExistente?.contratista ?? ""
  );
  const [obra, setObra] = useState(reciboExistente?.obra ?? "");
  const [ot, setOt] = useState(reciboExistente?.ot ?? "");
  const [prioridad, setPrioridad] = useState(reciboExistente?.prioridad ?? "normal");
  const [motivo, setMotivo] = useState(reciboExistente?.motivo ?? "");
  const [numeroInicial, setNumeroInicial] = useState(1);
  const [folioContinuado, setFolioContinuado] = useState(false);

  const [tarifas, setTarifas] = useState<TarifasElectrificacion>(TARIFAS_ELECTRIFICACION_INICIALES);
  const [parametrosAbiertos, setParametrosAbiertos] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string[] } | null>(null);

  const [foliosDb, setFoliosDb] = useState<FolioElectrificacionExistente[]>([]);
  useEffect(() => {
    const supabase = createClient();
    listarFoliosElectrificacion(supabase).then(setFoliosDb);
  }, []);

  const [reciboGuardado, setReciboGuardado] = useState<ReciboElectrificacionGuardado | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const fichaOcultaRef = useRef<HTMLDivElement>(null);

  const folioPrevio = useMemo(() => {
    // En modo edición el folio no cambia: no aplica el aviso de "ya existe".
    const f = reciboExistente ? "" : folio.trim();
    if (!f) return null;
    return foliosDb.find((x) => x.folio === f) ?? null;
  }, [folio, foliosDb, reciboExistente]);

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

  // Cambiar la cantidad de charolas conserva los drivers ya capturados de
  // las primeras y agrega las nuevas con 1 driver.
  function fijarCantidadCharolas(r: Renglon, n: number) {
    const cant = Math.max(0, Math.min(50, Math.floor(n) || 0));
    const charolas = Array.from({ length: cant }, (_, i) => r.charolas[i] ?? { drivers: 1 });
    actualizar(r.id, { charolas });
  }

  // OT y modelos vienen de los PM que subió Planeación: el generador solo deja
  // elegir OT que existan ahí, y los modelos son los de todos sus PM. La
  // cantidad de cada modelo se compara con lo que Planeación declaró para ese
  // modelo en la OT (ver conciliacion-pm.ts); si no concuerda, se avisa y se
  // pide el motivo al guardar.
  // undefined: cargando; null: la consulta falló.
  const [ots, setOts] = useState<OtElectrificacion[] | null | undefined>(undefined);
  useEffect(() => {
    listarOtsElectrificacion(createClient()).then(setOts);
  }, []);
  // Un recibo anterior que guardó el número de PM ("2PM193-24") cae en su OT.
  const otElegida = useMemo(() => {
    const clave = claveOt(ot);
    return (clave && ots?.find((o) => o.ot === clave)) || null;
  }, [ots, ot]);
  const claveElegida = otElegida?.ot ?? null;

  const [modelosDe, setModelosDe] = useState<{
    ot: string;
    modelos: ModeloOtElectrificacion[] | null;
  } | null>(null);
  useEffect(() => {
    if (!claveElegida) return;
    let vigente = true;
    listarModelosOtElectrificacion(createClient(), claveElegida, reciboExistente?.id).then(
      (modelos) => {
        if (vigente) setModelosDe({ ot: claveElegida, modelos });
      }
    );
    return () => {
      vigente = false;
    };
  }, [claveElegida, reciboExistente?.id]);
  const modelosOt = modelosDe && modelosDe.ot === claveElegida ? modelosDe.modelos : null;

  const modelosPorClave = useMemo(
    () => new Map((modelosOt ?? []).map((m) => [claveModelo(m.modelo), m])),
    [modelosOt]
  );

  // Selector de modelo: se abre al enfocar el campo de un renglón. Para todos
  // (personal y maquilador) solo trae los muebles con iluminación de la OT: es
  // contra lo que se mide Electrificación.
  const [modeloAbierto, setModeloAbierto] = useState<number | null>(null);
  function opcionesModelo(texto: string): ModeloOtElectrificacion[] {
    const q = claveModelo(texto);
    // Todos los modelos de la OT (la lista se desplaza y se filtra al escribir).
    return (modelosOt ?? []).filter((m) => !q || claveModelo(m.modelo).includes(q));
  }

  // Vuelve a leer lo ya registrado por modelo en la OT: tras guardar un recibo,
  // la cantidad registrada cambia y la comparación del siguiente debe usarla.
  function recargarModelos() {
    if (!claveElegida) return;
    const clave = claveElegida;
    listarModelosOtElectrificacion(createClient(), clave, reciboExistente?.id).then((modelos) => {
      setModelosDe({ ot: clave, modelos });
    });
  }

  // Conciliación de cada renglón contra los PM de la OT (misma regla que la
  // base, ver conciliacion-pm.ts); null donde aún no hay con qué comparar (sin
  // OT de Planeación o sin modelos cargados).
  const conciliaciones = useMemo(() => {
    if (!otElegida || modelosOt === null) return renglones.map(() => null);
    const saldo = new Map(
      modelosOt.map((m) => [
        claveModelo(m.modelo),
        { cantidadPm: m.cantidadPm, cantidadRegistrada: m.cantidadRegistrada },
      ])
    );
    return conciliarRenglones(renglones, saldo);
  }, [otElegida, modelosOt, renglones]);

  function continuarFolio() {
    if (!folioPrevio) return;
    setNumeroInicial(folioPrevio.numRenglones + 1);
    setObra(folioPrevio.obra);
    setOt(folioPrevio.ot);
    setFecha(folioPrevio.fecha);
    setFolioContinuado(true);
  }

  function evaluar(r: Renglon) {
    const res = resolverElectrificacion(r, prioridad, tarifas);
    const esManual = res.fuente === "manual";
    const b = bandaDe(esManual ? null : res.pu, Number(r.propuesto) || 0, esManual);
    return { res, esManual, b };
  }

  // En banda 'auto' el aceptado sigue al propuesto mientras el estimador no
  // lo toque (mismo criterio que Acabados).
  function aceptadoEfectivo(r: Renglon): number {
    const { b } = evaluar(r);
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

  const [avisoDescuadre, setAvisoDescuadre] = useState(false);
  const descuadres: Descuadre[] = renglones.flatMap((r, i) => {
    const c = conciliaciones[i];
    return c && requiereMotivo(c)
      ? [
          {
            id: r.id,
            num: numeroInicial + i,
            modelo: r.modelo,
            conciliacion: c,
            registrada: modelosPorClave.get(claveModelo(r.modelo))?.cantidadRegistrada ?? 0,
            motivo: r.motivoDescuadre,
          },
        ]
      : [];
  });
  // Recibo parcial: lo acumulado del modelo queda por debajo de lo declarado
  // (no es descuadre; falta cobrar el resto en otros recibos). Cuenta el último
  // renglón de cada modelo, que ya lleva el acumulado completo.
  const ultimoPorModelo = new Map<string, { modelo: string; acumulada: number; cantidadPm: number } | null>();
  renglones.forEach((r, i) => {
    const c = conciliaciones[i];
    if (!c) return;
    ultimoPorModelo.set(
      claveModelo(r.modelo),
      c.estado === "dentro"
        ? { modelo: normalizar(r.modelo), acumulada: c.acumulada, cantidadPm: c.cantidadPm }
        : null
    );
  });
  const parciales = [...ultimoPorModelo.values()].filter(
    (p): p is { modelo: string; acumulada: number; cantidadPm: number } =>
      p !== null && p.acumulada < p.cantidadPm
  );

  async function guardar() {
    const problemas: string[] = [];
    if (!folio.trim()) problemas.push("Falta el folio.");
    if (!fecha.trim()) problemas.push("Falta la fecha del recibo.");
    if (!contratista.trim()) problemas.push("Falta el contratista.");
    if (!ot.trim()) problemas.push("Falta la OT: elígela de la lista.");
    else if (ots && !otElegida) problemas.push("La OT no está en Planeación; elige una de la lista.");
    if (prioridad !== "normal" && !motivo.trim()) {
      problemas.push(`La prioridad ${prioridad} exige un motivo.`);
    }
    if (!renglones.length) problemas.push("El recibo no tiene renglones.");

    const renglonesGuardados: RenglonElectrificacionGuardado[] = [];
    const renglonesParaDb: RenglonElectrificacionParaGuardar[] = [];

    renglones.forEach((r, i) => {
      const { res, esManual, b } = evaluar(r);
      const num = numeroInicial + i;
      const metros = Number(r.metrosLed) || 0;
      const drivers = r.charolas.map((c) => Number(c.drivers) || 0);

      const cantidad = Number(r.cantidad) || 0;

      if (!r.modelo.trim()) problemas.push(`Renglón #${num}: falta el modelo.`);
      if (!(cantidad > 0)) problemas.push(`Renglón #${num}: falta la cantidad de piezas.`);
      if (metros <= 0 && !r.charolas.length) {
        problemas.push(`Renglón #${num}: captura metros de LED o al menos una charola.`);
      }
      if (metros > 0 && !r.complejidadLed) {
        problemas.push(`Renglón #${num}: falta la complejidad de colocación del LED.`);
      }
      if (drivers.some((d) => !(d > 0) || !Number.isInteger(d))) {
        problemas.push(`Renglón #${num}: cada charola necesita al menos 1 driver (número entero).`);
      }
      if (!(Number(r.propuesto) > 0)) {
        problemas.push(`Renglón #${num}: falta el precio propuesto por pieza.`);
      }
      if (puedeVerSugerido && b.banda === "justificar" && !r.justificacion.trim()) {
        problemas.push(`Renglón #${num}: falta justificación.`);
      }

      const aceptadoFinal = puedeVerSugerido ? aceptadoEfectivo(r) : 0;
      const justificacionFinal = puedeVerSugerido
        ? r.justificacion
        : b.banda === "justificar"
          ? "Pendiente de revisión: capturado sin ver el precio sugerido."
          : r.justificacion;
      const bandaFinal = b.banda as Banda;
      const complejidad = metros > 0 ? r.complejidadLed : "";

      renglonesGuardados.push({
        numero: num,
        modelo: normalizar(r.modelo),
        cantidad,
        metrosLed: metros,
        complejidadLed: complejidad,
        charolas: drivers.map((d, j) => ({ numero: j + 1, drivers: d, categoria: categoriaCharola(d) })),
        nota: r.nota,
        puSugerido: esManual ? null : res.pu,
        fuente: res.fuente,
        banda: bandaFinal,
        propuesto: Number(r.propuesto) || 0,
        aceptado: aceptadoFinal,
        importe: cantidad * aceptadoFinal,
        justificacion: justificacionFinal,
        pendienteRevision: !puedeVerSugerido,
      });

      renglonesParaDb.push({
        modelo: normalizar(r.modelo),
        cantidad,
        metrosLed: metros,
        complejidadLed: complejidad,
        charolas: drivers.map((d) => ({ drivers: d })),
        puSugerido: esManual ? null : res.pu,
        fuente: res.fuente,
        propuesto: Number(r.propuesto) || 0,
        aceptado: aceptadoFinal,
        banda: bandaFinal,
        justificacion: justificacionFinal,
        nota: r.nota,
        // Solo viaja en los renglones que lo necesitan (uno que ya cuadra no
        // debe dejar un motivo viejo).
        motivoDescuadre: requiereMotivo(conciliaciones[i]) ? r.motivoDescuadre : "",
      });
    });

    if (problemas.length) {
      setResultado({ ok: false, texto: problemas });
      return;
    }

    // Recién al guardar se avisa si las cantidades no concuerdan con el PM y
    // se pide el motivo, que revisará el administrador de Estimaciones.
    if (descuadres.some((d) => !d.motivo.trim())) {
      setAvisoDescuadre(true);
      return;
    }

    setGuardando(true);
    const supabase = createClient();
    const datosRecibo = {
      fechaRecibo: fecha,
      contratista,
      obra,
      ot,
      prioridad,
      motivoPrioridad: motivo,
    };
    const { error } = reciboExistente
      ? await modificarReciboElectrificacionEnDb(supabase, reciboExistente.id!, datosRecibo, renglonesParaDb)
      : await guardarReciboElectrificacionEnDb(supabase, { folio: folio.trim(), ...datosRecibo }, renglonesParaDb);
    setGuardando(false);

    if (error) {
      // La base vio un descuadre que la pantalla no: lo registrado del modelo
      // cambió desde que se abrió el formulario. Se refresca para que el
      // siguiente Guardar muestre el aviso y pida el motivo.
      if (esErrorDeDescuadre(error)) {
        recargarModelos();
        setResultado({ ok: false, texto: [AVISO_DESCUADRE_CAMBIO] });
        return;
      }
      setResultado({ ok: false, texto: [error] });
      return;
    }

    const nuevoRecibo: ReciboElectrificacionGuardado = {
      id: reciboExistente?.id,
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
    avisar(
      reciboExistente
        ? `Recibo ${nuevoRecibo.folio} modificado.`
        : `Recibo ${nuevoRecibo.folio} guardado.`
    );
    listarFoliosElectrificacion(supabase).then(setFoliosDb);
    recargarModelos();

    setResultado({
      ok: true,
      texto: [
        reciboExistente
          ? `Recibo ${nuevoRecibo.folio} modificado con ${renglones.length} renglones.`
          : `Recibo ${nuevoRecibo.folio} guardado con ${renglones.length} renglones.`,
        !puedeVerSugerido
          ? "Queda pendiente de revisión: el personal de Estimaciones acepta o modifica cada precio antes del pago."
          : "",
        parciales.length > 0
          ? `Recibo parcial: ${parciales
              .map((p) => `${p.modelo} lleva ${p.acumulada} de ${p.cantidadPm} pz declaradas`)
              .join("; ")}.`
          : "",
        descuadres.length > 0
          ? "⚠ Hay renglones cuya cantidad supera lo declarado en los PM de la OT: se envió el motivo al administrador de Estimaciones para que lo acepte o lo rechace."
          : "",
        "Generando el PDF del recibo…",
        reciboExistente ? "" : "El formulario quedó listo para otro recibo (se conservan fecha, obra y OT).",
      ].filter(Boolean),
    });

    // Recibo nuevo: se deja el formulario limpio para capturar el siguiente.
    if (!reciboExistente) {
      setFolio("");
      setRenglones([nuevoRenglon()]);
      setPrioridad("normal");
      setMotivo("");
      setNumeroInicial(1);
      setFolioContinuado(false);
    }

    window.setTimeout(() => {
      void generarPdfAutomatico(`recibo-electrificacion-${nuevoRecibo.folio}.pdf`);
    }, 50);
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-6 pb-28">
      {!puedeVerSugerido && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
          Captura tu precio propuesto para cada renglón. El personal de Estimaciones lo revisa
          (acepta o modifica) y el recibo se paga una vez revisado. Consulta el estado en Mis
          recibos.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {reciboExistente
              ? `Modificar recibo ${reciboExistente.folio}`
              : "Recibo de Electrificación"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {reciboExistente
              ? "Corrige lo que capturaste. Al guardar se reemplazan los renglones de este recibo."
              : "Modelo + cantidad + metros de LED y kit de charolas por pieza; el motor sugiere el precio por pieza."}
          </p>
        </div>
        {puedeVerSugerido && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Tarifas sin calibrar
          </span>
        )}
      </div>

      {/* ---------- Encabezado del recibo ---------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className={ETIQUETA}>Folio</span>
            <input
              className={`${CONTROL} font-mono ${reciboExistente ? "bg-slate-50 text-slate-600" : ""}`}
              value={folio}
              readOnly={!!reciboExistente}
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
              className={`${CONTROL} ${contratistaFijo ? "bg-slate-50 text-slate-600" : ""}`}
              value={contratista}
              readOnly={!!contratistaFijo}
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
            <select
              className={`${CONTROL} font-mono`}
              value={otElegida?.ot ?? ot}
              onChange={(e) => {
                const elegida = ots?.find((o) => o.ot === e.target.value);
                setOt(e.target.value);
                if (elegida?.proyecto && !obra.trim()) setObra(elegida.proyecto);
              }}
            >
              <option value="">
                {ots === undefined
                  ? "Cargando OT…"
                  : ots === null
                    ? "No se pudo cargar la lista de OT"
                    : "Elige la OT"}
              </option>
              {ot && !otElegida && <option value={ot}>{ot} (no está en Planeación)</option>}
              {(ots ?? []).map((o) => (
                <option key={o.ot} value={o.ot}>
                  {o.ot}
                  {o.proyecto ? ` — ${o.proyecto}` : ""}
                  {o.numPms > 1 ? ` (${o.numPms} PM)` : ""}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-400">
              Solo se muestran las OT y los modelos que incluyen iluminación.
            </span>
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

        {folioPrevio && !folioContinuado && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <span>
              <strong>El folio {folio} ya existe</strong> con {folioPrevio.numRenglones} renglón
              {folioPrevio.numRenglones === 1 ? "" : "es"} capturado
              {folioPrevio.numRenglones === 1 ? "" : "s"} ({fechaCorta(folioPrevio.fecha)}
              {folioPrevio.obra ? `, ${folioPrevio.obra}` : ""}).
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
          const { res, esManual, b } = evaluar(r);
          const sugerido = esManual ? null : res.pu;
          const aceptado =
            b.banda === "auto" && !r.tocadoAceptado ? Number(r.propuesto) || 0 : r.aceptado;
          const faltaJustificar = puedeVerSugerido && b.banda === "justificar" && !r.justificacion.trim();
          const metros = Number(r.metrosLed) || 0;
          const cantidad = Number(r.cantidad) || 0;

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
                    {r.modelo || "sin modelo"} · {cantidad} pz · {metros} m LED ·{" "}
                    {r.charolas.length} charola{r.charolas.length === 1 ? "" : "s"} por pieza
                    {puedeVerSugerido && (
                      <>
                        {" · "}
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${BANDA_ESTILO[b.banda]}`}
                        >
                          {BANDA_NOMBRE[b.banda]}
                        </span>
                      </>
                    )}
                    {" · "}
                    <span className="font-mono">{money(cantidad * (Number(r.propuesto) || 0))}</span>
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
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                      <label className="flex flex-col gap-1">
                        <span className={ETIQUETA}>Modelo</span>
                        <div className="relative">
                          <input
                            autoComplete="off"
                            placeholder={otElegida ? "Elige o escribe el modelo" : "Elige primero la OT"}
                            className={`${CONTROL} font-mono`}
                            value={r.modelo}
                            onFocus={() => setModeloAbierto(r.id)}
                            onBlur={() => setModeloAbierto(null)}
                            onChange={(e) => {
                              actualizar(r.id, { modelo: e.target.value });
                              setModeloAbierto(r.id);
                            }}
                          />
                          {modeloAbierto === r.id && opcionesModelo(r.modelo).length > 0 && (
                            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                              {opcionesModelo(r.modelo).map((m) => (
                                <li key={m.modelo}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      actualizar(r.id, { modelo: m.modelo });
                                      setModeloAbierto(null);
                                    }}
                                    className="flex w-full flex-col px-2.5 py-1.5 text-left text-sm hover:bg-indigo-50"
                                  >
                                    <span className="flex items-center justify-between gap-2">
                                      <span className="font-mono text-slate-900">{m.modelo}</span>
                                      <span className="whitespace-nowrap text-[11px] tabular-nums text-slate-500">
                                        {m.cantidadPm} en la OT
                                        {m.cantidadRegistrada > 0 && (
                                          <span
                                            className={
                                              m.cantidadRegistrada >= m.cantidadPm
                                                ? "font-semibold text-amber-700"
                                                : ""
                                            }
                                          >
                                            {" · "}
                                            {m.cantidadRegistrada} ya cobradas
                                          </span>
                                        )}
                                      </span>
                                    </span>
                                    {(otElegida?.numPms ?? 0) > 1 && m.pms && (
                                      <span className="truncate font-mono text-[10px] text-slate-400">
                                        {m.pms}
                                      </span>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={ETIQUETA}>Cantidad de piezas</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className={`${CONTROL} tabular-nums`}
                          value={r.cantidad}
                          onChange={(e) =>
                            actualizar(r.id, {
                              cantidad: e.target.value === "" ? "" : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>

                    {/* LED */}
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-700">Metros de LED por pieza</p>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className={ETIQUETA}>Metros</span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className={`${CONTROL} tabular-nums`}
                            value={r.metrosLed}
                            onChange={(e) =>
                              actualizar(r.id, {
                                metrosLed: e.target.value === "" ? "" : Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <div className="flex flex-col gap-1">
                          <span className={ETIQUETA}>Complejidad de colocación</span>
                          <div className="flex gap-1.5">
                            {OPCIONES_COMPLEJIDAD.map((o) => {
                              const on = r.complejidadLed === o.value;
                              return (
                                <button
                                  key={o.value}
                                  type="button"
                                  aria-pressed={on}
                                  disabled={metros <= 0}
                                  onClick={() => actualizar(r.id, { complejidadLed: o.value })}
                                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                    on
                                      ? "bg-slate-900 text-white ring-slate-900"
                                      : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
                                  }`}
                                >
                                  {o.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Kit de charolas */}
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-700">Kit de charolas por pieza</p>
                      <label className="mt-2 flex max-w-[12rem] flex-col gap-1">
                        <span className={ETIQUETA}>Cantidad de charolas</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          step={1}
                          className={`${CONTROL} tabular-nums`}
                          value={r.charolas.length}
                          onChange={(e) => fijarCantidadCharolas(r, Number(e.target.value))}
                        />
                      </label>
                      {r.charolas.length > 0 && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {r.charolas.map((c, j) => {
                            const d = Number(c.drivers) || 0;
                            const cat = d > 0 ? categoriaCharola(d) : null;
                            return (
                              <div
                                key={j}
                                className="flex items-end gap-2 rounded-md bg-slate-50 p-2 ring-1 ring-slate-200"
                              >
                                <label className="flex flex-1 flex-col gap-1">
                                  <span className={ETIQUETA}>Charola {j + 1} · drivers</span>
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className={`${CONTROL} tabular-nums`}
                                    value={c.drivers}
                                    onChange={(e) => {
                                      const charolas = r.charolas.map((x, k) =>
                                        k === j
                                          ? { drivers: e.target.value === "" ? "" : Number(e.target.value) }
                                          : x
                                      ) as Charola[];
                                      actualizar(r.id, { charolas });
                                    }}
                                  />
                                </label>
                                {cat && puedeVerSugerido && (
                                  <span
                                    title={CATEGORIA_RANGO[cat]}
                                    className={`mb-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${CATEGORIA_ESTILO[cat]}`}
                                  >
                                    {CATEGORIA_NOMBRE[cat]}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
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
                        <span className={ETIQUETA}>Precio propuesto por pieza</span>
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
                    <div className="flex flex-col gap-2 self-start rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div
                        className={`text-3xl font-semibold tracking-tight tabular-nums ${
                          sugerido == null ? "text-slate-400" : "text-slate-900"
                        }`}
                      >
                        {sugerido == null ? "Sin sugerencia" : money(sugerido)}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {FUENTE_ELECTRIFICACION_NOMBRE[res.fuente]}
                      </div>
                      <div className="text-xs text-slate-500">
                        {esManual ? `${res.detalle} Fija el precio y justifícalo.` : res.detalle}
                      </div>

                      <div className="mt-1 flex items-end gap-2">
                        <label className="flex flex-1 flex-col gap-1">
                          <span className={ETIQUETA}>Propuesto / pz</span>
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
                          <span className={ETIQUETA}>Aceptado / pz</span>
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
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${BANDA_ESTILO[b.banda]}`}
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
                          {money(cantidad * (Number(aceptado) || 0))}
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
          <strong>
            {resultado.ok
              ? reciboExistente
                ? "Recibo modificado"
                : "Recibo guardado"
              : reciboExistente
                ? "No se modificó"
                : "No se guardó"}
          </strong>
          <ul className="mt-1 list-inside list-disc">
            {resultado.texto.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          {reciboGuardado && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {reciboExistente && (
                <Link
                  href="/estimaciones/mis-recibos"
                  className="text-xs font-semibold text-indigo-700 hover:underline"
                >
                  ← Volver a Mis recibos
                </Link>
              )}
              <Link
                href={`/estimaciones/recibos/electrificacion/recibo/${encodeURIComponent(reciboGuardado.folio)}`}
                className="text-xs font-semibold text-indigo-700 hover:underline"
              >
                Ver ficha de seguimiento →
              </Link>
              {!generandoPdf && (
                <DescargarPdfButton
                  nombreArchivo={`recibo-electrificacion-${reciboGuardado.folio}.pdf`}
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
          <ReciboFichaElectrificacion
            recibo={reciboGuardado}
            qrUrl={
              typeof window !== "undefined"
                ? `${window.location.origin}/estimaciones/recibos/electrificacion/recibo/${encodeURIComponent(reciboGuardado.folio)}`
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
              <p className="text-xs text-slate-500">
                Sugerido por pieza = metros de LED × tarifa por metro de su complejidad + Σ tarifa
                de cada charola según su categoría, × factor de prioridad. Importe = cantidad × precio
                por pieza. Tarifas de arranque sin calibrar: ajústalas aquí para probar.
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={tarifas.aplicarVolumen}
                  onChange={(e) => setTarifas((t) => ({ ...t, aplicarVolumen: e.target.checked }))}
                />
                Aplicar escalón de volumen de Acabados al precio por pieza
                <span className="text-xs text-slate-400">
                  ({VOLUMEN.map((v) => `${v.clave} ×${v.valor.toFixed(2)}`).join(" · ")})
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    LED — precio por metro
                  </div>
                  <div className="flex flex-col gap-2 p-3">
                    {(Object.keys(COMPLEJIDAD_NOMBRE) as ComplejidadLed[]).map((k) => (
                      <label key={k} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-slate-700">{COMPLEJIDAD_NOMBRE[k]}</span>
                        <input
                          type="number"
                          min={0}
                          step={5}
                          className={`${CONTROL} max-w-[7rem] text-right tabular-nums`}
                          value={tarifas.metroLed[k]}
                          onChange={(e) =>
                            setTarifas((t) => ({
                              ...t,
                              metroLed: { ...t.metroLed, [k]: Number(e.target.value) || 0 },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Charola — precio por categoría
                  </div>
                  <div className="flex flex-col gap-2 p-3">
                    {(Object.keys(CATEGORIA_NOMBRE) as CategoriaCharola[]).map((k) => (
                      <label key={k} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-slate-700">
                          {CATEGORIA_NOMBRE[k]}{" "}
                          <span className="text-slate-400">({CATEGORIA_RANGO[k]})</span>
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          className={`${CONTROL} max-w-[7rem] text-right tabular-nums`}
                          value={tarifas.charola[k]}
                          onChange={(e) =>
                            setTarifas((t) => ({
                              ...t,
                              charola: { ...t.charola, [k]: Number(e.target.value) || 0 },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Prioridad
                  </div>
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(PRIORIDAD).map(([k, v]) => (
                        <tr key={k}>
                          <td className="px-3 py-1.5 capitalize text-slate-700">{k}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-900">
                            {v.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
            {guardando ? "Guardando…" : reciboExistente ? "Guardar cambios" : "Guardar recibo"}
          </button>
        </div>
      </div>

      {avisoDescuadre && (
        <DialogoDescuadres
          descuadres={descuadres}
          ot={ot}
          detalleModelos=" con iluminación"
          onMotivo={(id, motivo) => actualizar(id, { motivoDescuadre: motivo })}
          onCerrar={() => setAvisoDescuadre(false)}
          onConfirmar={() => {
            setAvisoDescuadre(false);
            void guardar();
          }}
        />
      )}
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
