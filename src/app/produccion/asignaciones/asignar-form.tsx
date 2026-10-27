"use client";

import { useState, type ReactNode } from "react";
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

import { type OpcionPaso, type RutasAsignar } from "@/lib/produccion/flujo-mueble";

export type { OpcionPaso };

const fmt = (n: number) => String(Math.round(n * 100) / 100);

// "mueble" o el id de la parte.
const MUEBLE = "mueble";

// Asigna parte (o todo) de un paso a un equipo. Se puede repetir para repartir el mismo
// paso entre varios equipos o con la planta; la base no deja pasar del tope de cada paso.
// Asignar más de lo que el paso anterior ya entregó se permite, con aviso: queda marcado
// como adelantado.
//
// Cada parte del despiece tiene su propia ruta y se asigna en sus PIEZAS (la Tabla, 3 por
// mueble × 13 muebles, tiene 39); el mueble completo tiene la suya, en muebles, con lo que
// se le hace ya armado (migración rutas_por_parte). Primero se elige qué se asigna y luego
// el paso de esa ruta.
export default function AsignarForm({
  itemId,
  descripcion,
  unidad,
  rutas,
  equipos,
  encargados,
  faltaDespiece = false,
  inicial,
  children,
  className,
  titulo,
}: {
  itemId: string;
  descripcion: string;
  unidad: string | null;
  rutas: RutasAsignar;
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  // Tiene componentes y todavía no tiene despiece: primero el despiece.
  faltaDespiece?: boolean;
  // Para abrir el formulario ya en una parte (o el mueble completo, parte null) y un paso.
  inicial?: { parte: string | null; paso?: number };
  // Contenido y estilo del botón que lo abre (por omisión, "Asignar").
  children?: ReactNode;
  className?: string;
  titulo?: string;
}) {
  const router = useRouter();
  // Lo que se puede elegir: cada parte con ruta y el mueble completo si su ruta tiene pasos.
  const opciones = [
    ...rutas.partes
      .filter((x) => x.pasos.length > 0)
      .map((x) => ({
        clave: x.parte.id,
        nombre: x.parte.descripcion,
        unidad: x.parte.unidad ?? "PZA",
        pasos: x.pasos,
      })),
    ...(rutas.mueble.length > 0
      ? [{ clave: MUEBLE, nombre: "Mueble completo", unidad: unidad ?? "", pasos: rutas.mueble }]
      : []),
  ];
  const libre = (pasos: OpcionPaso[]) => pasos.some((p) => p.disponible > 0);
  const sinDisponible = !faltaDespiece && !opciones.some((o) => libre(o.pasos));

  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);
  const [equipoId, setEquipoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [encargado, setEncargado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegida = opciones.find((o) => o.clave === clave) ?? null;
  const paso = elegida?.pasos[indice];
  const proceso = paso?.proceso;
  const equiposDelProceso = proceso ? equipos.filter((e) => e.activo && e.procesos.includes(proceso)) : [];
  const cantidadNum = Number(cantidad.replace(",", "."));
  const tope = paso?.disponible ?? 0;
  const listo = paso?.listo ?? 0;
  const esParte = !!elegida && elegida.clave !== MUEBLE;
  // Cuánto se adelanta al paso anterior (solo aviso).
  const adelanto =
    paso && paso.anterior && Number.isFinite(cantidadNum) && cantidadNum > listo
      ? Math.round((cantidadNum - listo) * 100) / 100
      : 0;

  // Por omisión, lo que ya está listo; si nada lo está, todo lo disponible.
  const sugerida = (p: OpcionPaso | undefined) => (p ? fmt(p.listo > 0 ? p.listo : p.disponible) : "");
  // El paso pedido si tiene lugar; si no, el primero que lo tenga.
  const pasoDe = (pasos: OpcionPaso[], pedido?: number) =>
    pedido !== undefined && (pasos[pedido]?.disponible ?? 0) > 0
      ? pedido
      : Math.max(0, pasos.findIndex((p) => p.disponible > 0));

  function elegir(nueva: string, pedido?: number) {
    const o = opciones.find((x) => x.clave === nueva);
    if (!o) return;
    const i = pasoDe(o.pasos, pedido);
    setClave(nueva);
    setIndice(i);
    setCantidad(sugerida(o.pasos[i]));
    if (!equipos.some((e) => e.id === equipoId && e.procesos.includes(o.pasos[i]?.proceso))) setEquipoId("");
  }

  function abrir() {
    const pedida = inicial ? (inicial.parte ?? MUEBLE) : null;
    const candidata =
      opciones.find((o) => o.clave === pedida && libre(o.pasos)) ?? opciones.find((o) => libre(o.pasos)) ?? null;
    setEquipoId("");
    setFecha(hoyMexico());
    setNotas("");
    setEncargado("");
    setError(null);
    if (candidata) elegir(candidata.clave, candidata.clave === pedida ? inicial?.paso : undefined);
    else setClave(null);
    setAbierto(true);
  }

  function cambiarPaso(i: number) {
    if (!elegida) return;
    setIndice(i);
    setCantidad(sugerida(elegida.pasos[i]));
    if (!equipos.some((e) => e.id === equipoId && e.procesos.includes(elegida.pasos[i].proceso))) setEquipoId("");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!paso || !elegida) return setError("Elige qué se asigna.");
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) return setError("La cantidad debe ser mayor que cero.");
    if (cantidadNum > tope) {
      return setError(
        esParte
          ? `"${elegida.nombre}" solo tiene ${fmt(tope)} ${elegida.unidad} por asignar en este paso.`
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
      p_parte_id: esParte ? elegida.clave : null,
    });
    setEnviando(false);
    if (error) {
      setError(mensajeErrorRpc(error.message));
      return;
    }
    setAbierto(false);
    const que = esParte ? `"${elegida.nombre}" asignada` : "Asignación guardada";
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
          ) : opciones.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Ni el mueble ni sus partes tienen pasos en su ruta: agrégalos antes de asignar.
            </p>
          ) : (
          <form onSubmit={enviar} className="flex flex-col gap-3">
            {opciones.length > 1 && (
              <fieldset className="flex min-w-0 flex-col gap-1">
                <legend className="mb-1 text-sm font-medium text-slate-700">¿Qué se asigna?</legend>
                <ul className="flex max-h-56 flex-col divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {opciones.map((o) => {
                    const hay = libre(o.pasos);
                    return (
                      <li key={o.clave}>
                        <label
                          className={`flex items-start gap-2 px-3 py-2 text-sm ${
                            hay ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="que"
                            className="mt-0.5"
                            checked={clave === o.clave}
                            disabled={!hay}
                            onChange={() => elegir(o.clave)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className={`block text-slate-900 ${o.clave === MUEBLE ? "font-semibold" : ""}`}>
                              {o.nombre}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {o.pasos.map((p) => p.etiqueta).join(" → ")}
                              {hay ? "" : " · ya asignado"}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
            {elegida && (
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="mb-1 text-sm font-medium text-slate-700">
                  Paso de la ruta {esParte ? `de "${elegida.nombre}"` : "del mueble completo"}
                </legend>
                {elegida.pasos.map((p) => (
                  <label
                    key={p.indice}
                    className={`flex flex-1 cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm ${
                      indice === p.indice ? "border-slate-900 bg-slate-50" : "border-slate-200"
                    } ${p.disponible <= 0 ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <input
                        type="radio"
                        name="paso"
                        value={p.indice}
                        checked={indice === p.indice}
                        disabled={p.disponible <= 0}
                        onChange={() => cambiarPaso(p.indice)}
                      />
                      {p.indice + 1}. {p.etiqueta}
                    </span>
                    <span className="text-xs text-slate-500">
                      {p.disponible <= 0 ? "Ya está asignado todo" : `${fmt(p.disponible)} ${elegida.unidad} por asignar`}
                      {p.anterior && p.disponible > 0 ? ` · ${fmt(p.listo)} listas` : ""}
                    </span>
                  </label>
                ))}
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
                {esParte ? `Piezas (${elegida?.unidad})` : "Cantidad"}
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
            {adelanto > 0 && paso && elegida && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                {paso.anterior} solo {paso.anterior === "Las partes" ? "alcanzan" : "ha entregado"} {fmt(listo)}{" "}
                {elegida.unidad} listas para este paso. Si asignas {fmt(cantidadNum)}, {fmt(adelanto)} se adelantan:
                se puede, pero la asignación queda marcada como adelantada.
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
                disabled={enviando || !equipoId || !paso}
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
