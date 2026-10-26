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

import { type OpcionPaso, type ParteMueble } from "@/lib/produccion/flujo-mueble";

export type { OpcionPaso };

const fmt = (n: number) => String(Math.round(n * 100) / 100);

type Modo = "partes" | "mueble";

// Lo que le queda a un paso: al mueble completo o, por partes, a la parte que más le falta
// (en sus piezas).
function disponibleDelPaso(p: OpcionPaso, modo: Modo): number {
  return modo === "partes" ? Math.max(0, ...p.partes.map((x) => x.disponible)) : p.disponible;
}

// Asigna parte (o todo) un paso de la ruta de un mueble a un equipo. Se puede
// repetir para repartir el mismo paso entre varios equipos o con la planta; la
// base no deja pasar del tope de cada paso. Asignar más de lo que el paso anterior
// ya entregó se permite, con aviso: queda marcado como adelantado.
//
// Un mueble con componentes se asigna SOLO por partes de su despiece: una parte a la
// vez y la cantidad en PIEZAS de esa parte (la Tabla, 3 por mueble × 13 muebles, tiene
// 39 piezas), solo en los procesos que la parte lleva. Un mueble sin componentes se
// asigna SOLO completo, en muebles (migración partes_en_piezas_y_ruta_por_parte).
export default function AsignarForm({
  itemId,
  descripcion,
  unidad,
  pasos,
  equipos,
  encargados,
  partes = [],
  conComponentes,
  pasoInicial: pasoPedido,
  parteInicial,
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
  // Tiene componentes en el PM: entonces solo por partes. Omitido: se decide por si tiene partes.
  conComponentes?: boolean;
  // Para abrir el formulario ya en un paso (desde el flujo del PM).
  pasoInicial?: number;
  // Para abrir el formulario ya con una parte elegida (desde la tabla del despiece).
  parteInicial?: string;
  // Contenido y estilo del botón que lo abre (por omisión, "Asignar").
  children?: ReactNode;
  className?: string;
  titulo?: string;
}) {
  const router = useRouter();
  const hayPartes = partes.length > 0;
  // Con componentes, solo por partes; sin ellos, solo el mueble completo.
  const modo: Modo = (conComponentes ?? hayPartes) ? "partes" : "mueble";
  // Con componentes y sin despiece guardado no hay qué asignar: primero el despiece.
  const faltaDespiece = modo === "partes" && !hayPartes;
  const avanceParte = (p: OpcionPaso | undefined, id: string) => p?.partes.find((x) => x.id === id);
  const inicialDe = () => {
    const cabe = (p: OpcionPaso) =>
      parteInicial ? (avanceParte(p, parteInicial)?.disponible ?? 0) > 0 : disponibleDelPaso(p, modo) > 0;
    return pasoPedido !== undefined && pasos[pasoPedido] && cabe(pasos[pasoPedido])
      ? pasoPedido
      : Math.max(0, pasos.findIndex(cabe));
  };
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(inicialDe);
  const [parteId, setParteId] = useState<string | null>(null);
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
  const sinDisponible = pasos.every((p) => disponibleDelPaso(p, modo) <= 0);
  const cantidadNum = Number(cantidad.replace(",", "."));
  const parte = partes.find((p) => p.id === parteId) ?? null;
  const avance = parteId ? avanceParte(paso, parteId) : undefined;
  // Las partes que llevan el proceso del paso elegido.
  const partesDelPaso = paso ? partes.filter((p) => avanceParte(paso, p.id)) : [];

  // Tope y lo listo de lo que se va a asignar: el mueble completo (muebles) o la parte
  // elegida (sus piezas).
  const tope = modo === "partes" ? (avance?.disponible ?? 0) : (paso?.disponible ?? 0);
  const listo = modo === "partes" ? (avance?.listo ?? 0) : (paso?.listo ?? 0);
  const unidadCantidad = modo === "partes" ? (parte?.unidad ?? "PZA") : (unidad ?? "");
  // Cuánto se adelanta al paso anterior (solo aviso).
  const adelanto =
    paso && paso.anterior && Number.isFinite(cantidadNum) && cantidadNum > listo
      ? Math.round((cantidadNum - listo) * 100) / 100
      : 0;

  // Por omisión, lo que ya está listo; si nada lo está, todo lo disponible.
  const sugerida = (disponible: number, enListo: number) => fmt(enListo > 0 ? enListo : disponible);
  function sugerirPara(p: OpcionPaso | undefined, id: string | null) {
    if (!p) return "";
    if (modo === "mueble") return sugerida(p.disponible, p.listo);
    const x = id ? avanceParte(p, id) : undefined;
    return x ? sugerida(x.disponible, x.listo) : "";
  }

  function abrir() {
    const i = inicialDe();
    const id = parteInicial && (avanceParte(pasos[i], parteInicial)?.disponible ?? 0) > 0 ? parteInicial : null;
    setIndice(i);
    setParteId(id);
    setEquipoId("");
    setCantidad(sugerirPara(pasos[i], id));
    setFecha(hoyMexico());
    setNotas("");
    setEncargado("");
    setError(null);
    setAbierto(true);
  }

  function cambiarPaso(i: number) {
    // La parte elegida se queda si todavía cabe en el paso nuevo.
    const id = parteId && (avanceParte(pasos[i], parteId)?.disponible ?? 0) > 0 ? parteId : null;
    setIndice(i);
    setParteId(id);
    setCantidad(sugerirPara(pasos[i], id));
    if (!equipos.some((e) => e.id === equipoId && e.procesos.includes(pasos[i].proceso))) setEquipoId("");
  }

  function elegir(id: string) {
    setParteId(id);
    setCantidad(sugerirPara(paso, id));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!paso) return;
    if (modo === "partes" && !parteId) return setError("Elige la parte del despiece.");
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) return setError("La cantidad debe ser mayor que cero.");
    if (cantidadNum > tope) {
      return setError(
        modo === "partes"
          ? `"${parte?.descripcion}" solo tiene ${fmt(tope)} ${unidadCantidad} por asignar en este paso.`
          : `Solo quedan ${fmt(tope)} por asignar en este paso.`
      );
    }
    setEnviando(true);
    setError(null);
    const { error } = await createClient().rpc("crear_asignacion_produccion", {
      p_item_id: itemId,
      p_equipo_id: equipoId,
      p_proceso: paso.proceso,
      p_cantidad: cantidadNum,
      p_fecha_asignacion: fecha,
      p_notas: notas,
      p_encargado: encargado,
      p_paso_id: paso.id,
      p_parte_id: modo === "partes" ? parteId : null,
    });
    setEnviando(false);
    if (error) {
      setError(mensajeErrorRpc(error.message));
      return;
    }
    setAbierto(false);
    const que = modo === "partes" ? `"${parte?.descripcion}" asignada` : "Asignación guardada";
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
          {faltaDespiece ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Este mueble tiene componentes: guarda su despiece para asignarlo por partes.
            </p>
          ) : (
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              {modo === "partes"
                ? "Este mueble tiene componentes: se asigna por partes de su despiece, en piezas."
                : "Este mueble no tiene componentes: se asigna completo."}
            </p>
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
              <fieldset className="flex min-w-0 flex-col gap-1">
                <legend className="mb-1 text-sm font-medium text-slate-700">Parte del despiece</legend>
                <ul className="flex max-h-56 flex-col divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {partesDelPaso.map((pt) => {
                    const av = avanceParte(paso, pt.id);
                    const disponible = av?.disponible ?? 0;
                    return (
                      <li key={pt.id}>
                        <label
                          className={`flex items-start gap-2 px-3 py-2 text-sm ${
                            disponible <= 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="radio"
                            name="parte"
                            className="mt-0.5"
                            checked={parteId === pt.id}
                            disabled={disponible <= 0}
                            onChange={() => elegir(pt.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-slate-900">{pt.descripcion}</span>
                            <span className="block text-xs text-slate-500">
                              {disponible <= 0
                                ? "ya asignada"
                                : `${fmt(disponible)} de ${fmt(av?.total ?? 0)} ${pt.unidad ?? "PZA"} por asignar`}
                              {paso.anterior && disponible > 0 && av ? ` · ${fmt(av.listo)} listas` : ""}
                            </span>
                          </span>
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
                {modo === "partes" ? `Piezas (${unidadCantidad})` : "Cantidad"}
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
                {paso.anterior} solo ha entregado {fmt(listo)} {unidadCantidad} listas para
                {modo === "partes" ? " esta parte" : " este paso"}. Si asignas {fmt(cantidadNum)}, {fmt(adelanto)} se
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
                disabled={enviando || !equipoId || (modo === "partes" && !parteId)}
                className={estiloBotonPrimario}
              >
                {enviando ? "Guardando…" : adelanto > 0 ? "Asignar de todos modos" : "Asignar"}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}
    </>
  );
}
