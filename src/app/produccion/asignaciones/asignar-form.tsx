"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import {
  hoyMexico,
  encargadosDeEquipo,
  mensajeErrorRpc,
  type EncargadoEquipo,
  type EquipoProduccion,
} from "@/lib/produccion/asignaciones";
import Modal, {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
  estiloEtiqueta,
} from "./modal";
import CampoEncargado from "./campo-encargado";

import { pesosPartes, type OpcionPaso, type ParteMueble } from "@/lib/produccion/flujo-mueble";

export type { OpcionPaso };

const fmt = (n: number) => String(Math.round(n * 100) / 100);

type Modo = "partes" | "mueble";

// Lo que le queda a un paso: al mueble completo o, por partes, a la parte que más le falta.
function disponibleDelPaso(p: OpcionPaso, modo: Modo): number {
  return modo === "partes" ? Math.max(0, ...p.partes.map((x) => x.disponible)) : p.disponible;
}

// Asigna parte (o todo) un paso de la ruta de un mueble a un equipo. Se puede
// repetir para repartir el mismo paso entre varios equipos o con la planta; la
// base no deja pasar de la cantidad del mueble en cada paso. Asignar más de lo
// que el paso anterior ya entregó se permite, con aviso: queda marcado como
// adelantado.
//
// Con despiece, se asigna por partes (lo normal cuando el mueble tiene varias): se
// eligen las partes que van al equipo y para cuántos muebles; las piezas son esa
// cantidad por las piezas por mueble de cada parte. También se puede asignar el
// mueble completo, que cuenta para todas sus partes (migración despiece_por_partes).
export default function AsignarForm({
  itemId,
  descripcion,
  unidad,
  pasos,
  equipos,
  encargados,
  partes = [],
  pasoInicial: pasoPedido,
  children,
  className,
  titulo,
}: {
  itemId: string;
  descripcion: string;
  unidad: string | null;
  pasos: OpcionPaso[];
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  // Partes vigentes del despiece del mueble (vacío si no tiene despiece).
  partes?: ParteMueble[];
  // Para abrir el formulario ya en un paso (desde el flujo del PM).
  pasoInicial?: number;
  // Contenido y estilo del botón que lo abre (por omisión, "Asignar").
  children?: ReactNode;
  className?: string;
  titulo?: string;
}) {
  const router = useRouter();
  const hayPartes = partes.length > 0;
  // El % del mueble que vale cada parte (lo guardado en el despiece o partes iguales).
  const pesos = pesosPartes(partes);
  // Por partes si el mueble tiene varias; con una sola, el mueble completo.
  const modoInicial: Modo = partes.length > 1 ? "partes" : "mueble";
  const inicialDe = (modo: Modo) =>
    pasoPedido !== undefined && pasos[pasoPedido] && disponibleDelPaso(pasos[pasoPedido], modo) > 0
      ? pasoPedido
      : Math.max(0, pasos.findIndex((p) => disponibleDelPaso(p, modo) > 0));
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [indice, setIndice] = useState(inicialDe(modoInicial));
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [equipoId, setEquipoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [encargado, setEncargado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paso = pasos[indice] as OpcionPaso | undefined;
  const proceso = paso?.proceso;
  const equiposDelProceso = useMemo(
    () => (proceso ? equipos.filter((e) => e.activo && e.procesos.includes(proceso)) : []),
    [equipos, proceso]
  );
  const sinDisponible = pasos.every((p) => disponibleDelPaso(p, "mueble") <= 0 && disponibleDelPaso(p, "partes") <= 0);
  const cantidadNum = Number(cantidad.replace(",", "."));
  const avanceParte = (p: OpcionPaso | undefined, id: string) => p?.partes.find((x) => x.id === id);

  // Tope y lo listo de lo que se va a asignar: el mueble completo, o por partes, lo de la
  // parte elegida con menos (todas reciben la misma cantidad de muebles).
  const elegidas = seleccion.map((id) => avanceParte(paso, id)).filter((x) => x !== undefined);
  const tope = modo === "partes" ? (elegidas.length ? Math.min(...elegidas.map((x) => x.disponible)) : 0) : (paso?.disponible ?? 0);
  const listo = modo === "partes" ? (elegidas.length ? Math.min(...elegidas.map((x) => x.listo)) : 0) : (paso?.listo ?? 0);
  // Cuánto se adelanta al paso anterior (solo aviso).
  const adelanto =
    paso && paso.anterior && Number.isFinite(cantidadNum) && cantidadNum > listo
      ? Math.round((cantidadNum - listo) * 100) / 100
      : 0;

  // Por omisión, lo que ya está listo; si nada lo está, todo lo disponible.
  const sugerida = (disponible: number, enListo: number) => fmt(enListo > 0 ? enListo : disponible);
  function sugerirPara(p: OpcionPaso | undefined, m: Modo, ids: string[]) {
    if (!p) return "";
    if (m === "mueble") return sugerida(p.disponible, p.listo);
    const xs = ids.map((id) => avanceParte(p, id)).filter((x) => x !== undefined);
    if (xs.length === 0) return "";
    return sugerida(Math.min(...xs.map((x) => x.disponible)), Math.min(...xs.map((x) => x.listo)));
  }

  function abrir() {
    const i = inicialDe(modoInicial);
    setModo(modoInicial);
    setIndice(i);
    setSeleccion([]);
    setEquipoId("");
    setCantidad(sugerirPara(pasos[i], modoInicial, []));
    setFecha(hoyMexico());
    setNotas("");
    setEncargado("");
    setError(null);
    setAbierto(true);
  }

  function cambiarModo(m: Modo) {
    const i = pasos[indice] && disponibleDelPaso(pasos[indice], m) > 0 ? indice : inicialDe(m);
    setModo(m);
    setIndice(i);
    setSeleccion([]);
    setCantidad(sugerirPara(pasos[i], m, []));
  }

  function cambiarPaso(i: number) {
    // Se quedan elegidas solo las partes que todavía caben en el paso nuevo.
    const ids = seleccion.filter((id) => (avanceParte(pasos[i], id)?.disponible ?? 0) > 0);
    setIndice(i);
    setSeleccion(ids);
    setCantidad(sugerirPara(pasos[i], modo, ids));
    if (!equipos.some((e) => e.id === equipoId && e.procesos.includes(pasos[i].proceso))) setEquipoId("");
  }

  function elegir(id: string, marcada: boolean) {
    const ids = marcada ? [...seleccion, id] : seleccion.filter((x) => x !== id);
    setSeleccion(ids);
    setCantidad(sugerirPara(paso, modo, ids));
  }

  function elegirTodas() {
    const ids = partes.filter((pt) => (avanceParte(paso, pt.id)?.disponible ?? 0) > 0).map((pt) => pt.id);
    setSeleccion(ids);
    setCantidad(sugerirPara(paso, modo, ids));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!paso) return;
    if (modo === "partes" && seleccion.length === 0) return setError("Elige al menos una parte del despiece.");
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) return setError("La cantidad debe ser mayor que cero.");
    if (cantidadNum > tope) {
      return setError(
        modo === "partes"
          ? `Las partes elegidas solo tienen ${fmt(tope)} mueble(s) por asignar en este paso.`
          : `Solo quedan ${fmt(tope)} por asignar en este paso.`
      );
    }
    setEnviando(true);
    setError(null);
    const comun = {
      p_item_id: itemId,
      p_equipo_id: equipoId,
      p_proceso: paso.proceso,
      p_cantidad: cantidadNum,
      p_fecha_asignacion: fecha,
      p_notas: notas,
      p_encargado: encargado,
      p_paso_id: paso.id,
    };
    const { error } =
      modo === "partes"
        ? await createClient().rpc("crear_asignaciones_por_partes", { ...comun, p_partes: seleccion })
        : await createClient().rpc("crear_asignacion_produccion", comun);
    setEnviando(false);
    if (error) {
      setError(mensajeErrorRpc(error.message));
      return;
    }
    setAbierto(false);
    const que = modo === "partes" ? `${seleccion.length} parte(s) asignada(s)` : "Asignación guardada";
    avisar(adelanto > 0 ? `${que} (adelantada al paso anterior)` : que);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={sinDisponible}
        title={sinDisponible ? "Ya está asignado todo el mueble" : titulo}
        className={
          className ??
          "rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
        }
      >
        {children ?? "Asignar"}
      </button>
      {abierto && (
        <Modal titulo="Asignar a un equipo" subtitulo={descripcion} onCerrar={() => !enviando && setAbierto(false)}>
          <form onSubmit={enviar} className="flex flex-col gap-3">
            {hayPartes && (
              <div role="radiogroup" aria-label="Qué se asigna" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                {(["partes", "mueble"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={modo === m}
                    onClick={() => cambiarModo(m)}
                    className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                      modo === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {m === "partes" ? "Por partes" : "Mueble completo"}
                  </button>
                ))}
              </div>
            )}
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Paso de la ruta</legend>
              {pasos.map((p) => {
                const disponible = disponibleDelPaso(p, modo);
                return (
                  <label
                    key={p.indice}
                    className={`flex flex-1 cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm ${
                      indice === p.indice ? "border-slate-900 bg-slate-50" : "border-slate-200"
                    } ${disponible <= 0 ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <input
                        type="radio"
                        name="paso"
                        value={p.indice}
                        checked={indice === p.indice}
                        disabled={disponible <= 0}
                        onChange={() => cambiarPaso(p.indice)}
                      />
                      {p.indice + 1}. {p.etiqueta}
                    </span>
                    <span className="text-xs text-slate-500">
                      {disponible <= 0
                        ? "Ya está asignado todo"
                        : modo === "partes"
                          ? `${p.partes.filter((x) => x.disponible > 0).length} parte(s) por asignar`
                          : `${fmt(disponible)} ${unidad ?? ""} por asignar`}
                      {modo === "mueble" && p.anterior && disponible > 0 ? ` · ${fmt(p.listo)} listas` : ""}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {modo === "partes" && paso && (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium text-slate-700">
                  Partes del despiece
                  <button type="button" onClick={elegirTodas} className="text-xs font-medium text-brand-700 hover:underline">
                    Elegir todas las que faltan
                  </button>
                </legend>
                <p className="text-xs text-slate-500">
                  Lo elegido es el {fmt(seleccion.reduce((s, id) => s + (pesos.get(id) ?? 0), 0))} % del mueble.
                </p>
                <ul className="flex max-h-56 flex-col divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {partes.map((pt) => {
                    const av = avanceParte(paso, pt.id);
                    const disponible = av?.disponible ?? 0;
                    const marcada = seleccion.includes(pt.id);
                    const piezas =
                      marcada && Number.isFinite(cantidadNum) && cantidadNum > 0
                        ? `${fmt(cantidadNum * pt.piezasPorMueble)} ${pt.unidad ?? "PZA"}`
                        : null;
                    return (
                      <li key={pt.id}>
                        <label
                          className={`flex items-start gap-2 px-3 py-2 text-sm ${
                            disponible <= 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={marcada}
                            disabled={disponible <= 0}
                            onChange={(e) => elegir(pt.id, e.target.checked)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-slate-900">{pt.descripcion}</span>
                            <span className="block text-xs text-slate-500">
                              {fmt(pesos.get(pt.id) ?? 0)} % del mueble · {fmt(pt.piezasPorMueble)} {pt.unidad ?? "PZA"} por
                              mueble ·{" "}
                              {disponible <= 0 ? "ya asignada" : `${fmt(disponible)} mueble(s) por asignar`}
                              {paso.anterior && disponible > 0 && av ? ` · ${fmt(av.listo)} listos` : ""}
                            </span>
                          </span>
                          {piezas && <span className="shrink-0 text-xs font-medium text-slate-700">{piezas}</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
            <label className={estiloEtiqueta}>
              Equipo
              <select
                required
                value={equipoId}
                onChange={(e) => setEquipoId(e.target.value)}
                className={estiloCampo}
              >
                <option value="" disabled>
                  {equiposDelProceso.length ? "Elige un equipo" : "No hay equipos de este proceso"}
                </option>
                {equiposDelProceso.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                    {e.es_planta ? " (planta)" : e.encargado ? ` — ${e.encargado}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <CampoEncargado
              valor={encargado}
              onCambio={setEncargado}
              sugerencias={encargadosDeEquipo(encargados, equipoId)}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className={estiloEtiqueta}>
                {modo === "partes" ? "Para cuántos muebles" : "Cantidad"}
                <input
                  type="number"
                  required
                  min="0.01"
                  max={tope || undefined}
                  step="any"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={estiloCampo}
                />
              </label>
              <label className={estiloEtiqueta}>
                Fecha de asignación
                <input
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className={estiloCampo}
                />
              </label>
            </div>
            <label className={estiloEtiqueta}>
              Notas (opcional)
              <input
                type="text"
                maxLength={300}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className={estiloCampo}
              />
            </label>
            {adelanto > 0 && paso && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                {paso.anterior} solo ha entregado {fmt(listo)} {modo === "partes" ? "mueble(s)" : (unidad ?? "")} listos para
                {modo === "partes" ? " lo elegido" : " este paso"}. Si asignas {fmt(cantidadNum)}, {fmt(adelanto)} se
                adelantan: se puede, pero la asignación queda marcada como adelantada.
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
            )}
            <div className="flex justify-end gap-2">
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
                disabled={enviando || !equipoId || (modo === "partes" && seleccion.length === 0)}
                className={estiloBotonPrimario}
              >
                {enviando ? "Guardando…" : adelanto > 0 ? "Asignar de todos modos" : "Asignar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
