"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { HISTORICO, type RenglonHistorico } from "@/lib/estimaciones/datos-acabados";
import { TARIFAS_BASE_ARMADO, TARIFAS_FIJAS_ARMADO } from "@/lib/estimaciones/datos-armado";
import {
  BANDA_NOMBRE,
  FUENTE_NOMBRE,
  bandaDe,
  fechaCorta,
  money,
  resolver,
  type Banda,
  type ConfiguracionMotor,
  type Fuente,
} from "@/lib/estimaciones/motor-precio";
import {
  CATEGORIA_NOMBRE,
  COMPLEJIDAD_NOMBRE,
  FUENTE_ELECTRIFICACION_NOMBRE,
  TARIFAS_ELECTRIFICACION_INICIALES,
  resolverElectrificacion,
  type FuenteElectrificacion,
} from "@/lib/estimaciones/motor-electrificacion";
import {
  cargarHistoricoDb,
  type DecisionRenglon,
  type ReciboGuardado,
  type TipoRecibo,
} from "@/lib/estimaciones/recibos-db";
import type { ReciboElectrificacionGuardado } from "@/lib/estimaciones/recibos-electrificacion-db";
import {
  NOMBRE_TIPO_CUALQUIERA,
  decidirRenglon,
  marcarReciboPagado,
  type TipoCualquierRecibo,
} from "@/lib/estimaciones/revision-db";
import EstadoReciboBadge from "../../../estado-recibo-badge";

type Props =
  | { tipo: TipoRecibo; recibo: ReciboGuardado }
  | { tipo: "electrificacion"; recibo: ReciboElectrificacionGuardado };

// Lo que el motor sugiere para un renglón al momento de revisarlo.
interface Sugerencia {
  pu: number | null;
  fuente: string;
  fuenteNombre: string;
  detalle: string;
  esManual: boolean;
}

// Forma común de un renglón para revisar, sea del tipo que sea.
interface RenglonRevision {
  id: string;
  numero: number;
  modelo: string;
  descripcion: string;
  cantidad: number;
  propuesto: number;
  aceptado: number;
  decision: DecisionRenglon;
  puSugeridoGuardado: number | null;
  fuenteGuardada: string;
  bandaGuardada: Banda | null;
  justificacion: string;
  nota: string;
  sugerir: (historico: RenglonHistorico[]) => Sugerencia;
}

const CFG_ACABADOS: ConfiguracionMotor = {
  nivel3Visible: false,
  recargoAcabado2: 0,
  tarifasProyecto: [],
};
const CFG_ARMADO: ConfiguracionMotor = {
  ...CFG_ACABADOS,
  tarifasFijas: TARIFAS_FIJAS_ARMADO,
  tarifasBase: TARIFAS_BASE_ARMADO,
};

const BANDA_ESTILO: Record<Banda, string> = {
  auto: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  estimador: "bg-amber-50 text-amber-700 ring-amber-200",
  justificar: "bg-rose-50 text-rose-700 ring-rose-200",
};

const ETIQUETA = "text-[11px] font-medium uppercase tracking-wide text-slate-500";
const CONTROL =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 " +
  "focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function nombreFuente(fuente: string): string {
  return (
    FUENTE_NOMBRE[fuente as Fuente] ??
    FUENTE_ELECTRIFICACION_NOMBRE[fuente as FuenteElectrificacion] ??
    fuente
  );
}

function aRenglones(props: Props): RenglonRevision[] {
  if (props.tipo === "electrificacion") {
    const prioridad = props.recibo.prioridad;
    return props.recibo.renglones.map((r) => ({
      id: r.id ?? "",
      numero: r.numero,
      modelo: r.modelo,
      descripcion: [
        r.metrosLed > 0
          ? `${r.metrosLed} m LED ${r.complejidadLed ? COMPLEJIDAD_NOMBRE[r.complejidadLed].toLowerCase() : ""}`
          : "sin LED",
        r.charolas.length
          ? `${r.charolas.length} charola${r.charolas.length > 1 ? "s" : ""} (${r.charolas
              .map((c) => `${c.drivers} drv ${CATEGORIA_NOMBRE[c.categoria].toLowerCase()}`)
              .join(", ")})`
          : "sin charolas",
        "por pieza",
      ].join(" · "),
      cantidad: r.cantidad,
      propuesto: r.propuesto,
      aceptado: r.aceptado,
      decision: r.decision ?? null,
      puSugeridoGuardado: r.puSugerido,
      fuenteGuardada: r.fuente,
      bandaGuardada: r.banda,
      justificacion: r.justificacion,
      nota: r.nota,
      sugerir: () => {
        const res = resolverElectrificacion(
          {
            cantidad: r.cantidad,
            metrosLed: r.metrosLed,
            complejidadLed: r.complejidadLed,
            charolas: r.charolas.map((c) => ({ drivers: c.drivers })),
          },
          prioridad,
          TARIFAS_ELECTRIFICACION_INICIALES
        );
        return {
          pu: res.fuente === "manual" ? null : res.pu,
          fuente: res.fuente,
          fuenteNombre: FUENTE_ELECTRIFICACION_NOMBRE[res.fuente],
          detalle: res.detalle,
          esManual: res.fuente === "manual",
        };
      },
    }));
  }

  const { tipo, recibo } = props;
  const entradaRecibo = { ot: recibo.ot, prioridad: recibo.prioridad };
  return recibo.renglones.map((r) => ({
    id: r.id ?? "",
    numero: r.numero,
    modelo: r.modelo,
    descripcion:
      tipo === "armado"
        ? [r.familia, r.tipoArmado, r.colocacionHerrajes ? "con herrajes" : "sin herrajes"]
            .filter(Boolean)
            .join(" · ")
        : [r.familia, r.acabado, r.acabado2 && `2º ${r.acabado2}`, r.tamano]
            .filter(Boolean)
            .join(" · "),
    cantidad: r.cantidad,
    propuesto: r.propuesto,
    aceptado: r.aceptado,
    decision: r.decision ?? null,
    puSugeridoGuardado: r.puSugerido,
    fuenteGuardada: r.fuente,
    bandaGuardada: r.banda,
    justificacion: r.justificacion,
    nota: r.nota,
    sugerir: (historico) => {
      const entrada =
        tipo === "armado"
          ? {
              modelo: r.modelo,
              familia: r.familia,
              tamano: r.tamano,
              cantidad: r.cantidad,
              acabado: r.tipoArmado ?? "",
              acabado2: "",
              tipoArmado: r.tipoArmado,
              herrajes: r.colocacionHerrajes ?? false,
            }
          : {
              modelo: r.modelo,
              familia: r.familia,
              tamano: r.tamano,
              cantidad: r.cantidad,
              acabado: r.acabado,
              acabado2: r.acabado2,
            };
      const res = resolver(entrada, entradaRecibo, tipo === "armado" ? CFG_ARMADO : CFG_ACABADOS, historico);
      const esManual = res.fuente === "manual" || res.sombra;
      return {
        pu: esManual ? null : res.pu,
        fuente: esManual ? "manual" : res.fuente,
        fuenteNombre: FUENTE_NOMBRE[esManual ? "manual" : res.fuente],
        detalle: esManual
          ? res.sombra
            ? "El estimado por familia aún no se muestra: fija el precio y justifícalo."
            : "Sin tarifa ni precedente. Fija el precio y justifícalo."
          : res.detalle,
        esManual,
      };
    },
  }));
}

export default function RevisionRecibo(props: Props) {
  const router = useRouter();
  const { tipo, recibo } = props;
  const estado = recibo.estado ?? "pendiente";
  const editable = estado === "pendiente" || estado === "revisado";

  const renglones = useMemo(() => aRenglones(props), [props]);

  // Histórico para los precedentes (Acabados: base + guardados; Armado: solo
  // guardados de armado). Electrificación no usa precedentes.
  const [historico, setHistorico] = useState<RenglonHistorico[]>(tipo === "acabados" ? HISTORICO : []);
  useEffect(() => {
    if (tipo === "electrificacion") return;
    cargarHistoricoDb(createClient(), tipo).then((db) =>
      setHistorico(tipo === "acabados" ? [...HISTORICO, ...db] : db)
    );
  }, [tipo]);

  const totales = renglones.reduce(
    (acc, r) => {
      acc.propuesto += r.cantidad * r.propuesto;
      if (r.decision) acc.aceptado += r.cantidad * r.aceptado;
      if (!r.decision) acc.pendientes += 1;
      return acc;
    },
    { propuesto: 0, aceptado: 0, pendientes: 0 }
  );

  const [pagando, setPagando] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);

  async function pagar() {
    if (!recibo.id) return;
    if (!window.confirm(`¿Marcar el recibo ${recibo.folio} como pagado? Ya no se podrá modificar.`)) {
      return;
    }
    setPagando(true);
    setErrorPago(null);
    const { error } = await marcarReciboPagado(createClient(), tipo as TipoCualquierRecibo, recibo.id);
    setPagando(false);
    if (error) {
      setErrorPago(error);
      return;
    }
    router.refresh();
  }

  const fichaUrl = `/estimaciones/recibos/${tipo}/recibo/${encodeURIComponent(recibo.folio)}`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Revisión · {NOMBRE_TIPO_CUALQUIERA[tipo]}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Folio <span className="font-mono">{recibo.folio}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {recibo.contratista} · {recibo.obra || "sin obra"} · OT {recibo.ot || "—"} ·{" "}
            {fechaCorta(recibo.fecha)}
            {recibo.prioridad !== "normal" && ` · prioridad ${recibo.prioridad}: ${recibo.motivo}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <EstadoReciboBadge estado={estado} />
          <Link href={fichaUrl} className="text-sm font-medium text-indigo-600 hover:underline">
            Ver ficha
          </Link>
        </div>
      </div>

      {estado === "pagado" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Este recibo ya está pagado; los precios ya no se pueden cambiar.
        </div>
      )}
      {estado === "cancelado" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Este recibo fue cancelado.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {renglones.map((r) => (
          <RenglonRevisionCard
            key={r.id}
            tipo={tipo}
            renglon={r}
            historico={historico}
            editable={editable}
          />
        ))}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-sm shadow-sm backdrop-blur">
        <Total etiqueta="Propuesto" valor={money(totales.propuesto)} />
        <Total etiqueta="Aceptado (decidido)" valor={money(totales.aceptado)} />
        <Total
          etiqueta="Sin revisar"
          valor={`${totales.pendientes} de ${renglones.length}`}
        />
        <div className="ml-auto flex flex-col items-end gap-1">
          {estado === "pendiente" && (
            <span className="text-xs text-slate-500">
              El recibo pasa a “Revisado” en cuanto decidas todos los renglones.
            </span>
          )}
          {estado === "revisado" && (
            <button
              type="button"
              onClick={() => void pagar()}
              disabled={pagando}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {pagando ? "Guardando…" : `Marcar como pagado · ${money(totales.aceptado)}`}
            </button>
          )}
          {errorPago && <span className="text-xs text-rose-600">{errorPago}</span>}
        </div>
      </div>
    </main>
  );
}

function RenglonRevisionCard({
  tipo,
  renglon: r,
  historico,
  editable,
}: {
  tipo: TipoCualquierRecibo;
  renglon: RenglonRevision;
  historico: RenglonHistorico[];
  editable: boolean;
}) {
  const router = useRouter();
  const decidido = r.decision != null;
  const [editando, setEditando] = useState(!decidido && editable);
  const [aceptado, setAceptado] = useState<number | "">(decidido ? r.aceptado : r.propuesto);
  const [justificacion, setJustificacion] = useState(r.justificacion);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ya decidido: se muestra lo que se guardó. Por decidir: el motor ahora.
  const sug: Sugerencia = decidido && !editando
    ? {
        pu: r.puSugeridoGuardado,
        fuente: r.fuenteGuardada,
        fuenteNombre: nombreFuente(r.fuenteGuardada),
        detalle: "Sugerido al momento de la revisión.",
        esManual: r.puSugeridoGuardado == null,
      }
    : r.sugerir(historico);
  const b = bandaDe(sug.pu, r.propuesto, sug.esManual);
  const faltaJustificar = b.banda === "justificar" && !justificacion.trim();

  async function decidir(precio: number) {
    if (faltaJustificar) {
      setError("Este precio necesita justificación.");
      return;
    }
    if (!(precio >= 0)) {
      setError("Captura un precio válido.");
      return;
    }
    setGuardando(true);
    setError(null);
    const { error } = await decidirRenglon(createClient(), tipo, r.id, {
      aceptado: precio,
      puSugerido: sug.pu,
      fuente: sug.fuente,
      banda: b.banda,
      justificacion,
    });
    setGuardando(false);
    if (error) {
      setError(error);
      return;
    }
    setEditando(false);
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2">
        <span className="font-mono text-xs font-semibold text-slate-500">#{r.numero}</span>
        <span className="font-mono text-sm font-semibold text-slate-900">{r.modelo}</span>
        <span className="truncate text-sm text-slate-600">
          {r.descripcion} · {r.cantidad} pz
        </span>
        <span className="ml-auto">
          {r.decision === "aceptado" && (
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              Aceptado
            </span>
          )}
          {r.decision === "modificado" && (
            <span className="rounded bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
              Modificado
            </span>
          )}
          {!r.decision && (
            <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
              Sin revisar
            </span>
          )}
        </span>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className={ETIQUETA}>Propuesto por el maquilador</span>
          <span className="text-2xl font-semibold tabular-nums text-slate-900">
            {money(r.propuesto)}
            <span className="text-sm font-normal text-slate-500"> / pz</span>
          </span>
          <span className="text-xs tabular-nums text-slate-500">
            Importe {money(r.cantidad * r.propuesto)}
          </span>
          {r.nota && <span className="text-xs text-slate-500">Nota: {r.nota}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <span className={ETIQUETA}>Sugerido · {sug.fuenteNombre}</span>
          <span
            className={`text-2xl font-semibold tabular-nums ${
              sug.pu == null ? "text-slate-400" : "text-slate-900"
            }`}
          >
            {sug.pu == null ? "Sin sugerencia" : money(sug.pu)}
          </span>
          <span className="text-xs text-slate-500">{sug.detalle}</span>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ${BANDA_ESTILO[b.banda]}`}
            >
              {BANDA_NOMBRE[b.banda]}
            </span>
            {b.dif != null && (
              <span className="text-xs tabular-nums text-slate-500">
                {b.dif >= 0 ? "+" : ""}
                {(b.dif * 100).toFixed(1)}% vs sugerido
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {!editando ? (
            <>
              <span className={ETIQUETA}>Precio aceptado</span>
              <span className="text-2xl font-semibold tabular-nums text-slate-900">
                {decidido ? money(r.aceptado) : "—"}
                {decidido && <span className="text-sm font-normal text-slate-500"> / pz</span>}
              </span>
              {decidido && (
                <span className="text-xs tabular-nums text-slate-500">
                  Importe {money(r.cantidad * r.aceptado)}
                </span>
              )}
              {r.justificacion && (
                <span className="text-xs text-slate-500">Justificación: {r.justificacion}</span>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="w-fit text-xs font-medium text-indigo-600 hover:underline"
                >
                  Cambiar decisión
                </button>
              )}
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className={ETIQUETA}>Precio aceptado por pieza</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  className={`${CONTROL} tabular-nums`}
                  value={aceptado}
                  onChange={(e) =>
                    setAceptado(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </label>
              {b.banda === "justificar" && (
                <textarea
                  rows={2}
                  placeholder="Por qué se acepta o se modifica este precio"
                  className={`${CONTROL} ${faltaJustificar ? "border-rose-300" : ""}`}
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => void decidir(r.propuesto)}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  Aceptar {money(r.propuesto)}
                </button>
                <button
                  type="button"
                  disabled={guardando || aceptado === "" || Number(aceptado) === r.propuesto}
                  onClick={() => void decidir(Number(aceptado))}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  Modificar a {aceptado === "" ? "—" : money(Number(aceptado))}
                </button>
                {decidido && (
                  <button
                    type="button"
                    onClick={() => setEditando(false)}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </>
          )}
          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      </div>
    </section>
  );
}

function Total({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <span className={ETIQUETA}>{etiqueta}</span>
      <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">{valor}</span>
    </div>
  );
}
