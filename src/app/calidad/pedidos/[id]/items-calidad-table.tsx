"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DIAS_ANTIGUEDAD_ALERTA } from "./antiguedad";

export interface InformeResumen {
  id: string;
  folio: string;
  aprobado: boolean;
  elaborado_en: string;
  descripcion: string | null;
}

export interface ItemCalidadRow {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  tipo_material: string | null;
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  parent_item_id: string | null;
  imagenUrl: string | null;
  liberadoEn: string | null;
  estadoRevision: string | null;
  motivoCancelacion: string | null;
  // Historial completo del ítem, ordenado desc — [0] es el más reciente.
  informes: InformeResumen[];
}

type FiltroCalidad = "todos" | "aprobado" | "no_aprobado" | "sin_evaluar" | "cancelado";

// Un ítem cancelado en Planeación/Producción se muestra así aunque ya
// tenga informes de calidad previos — su historial de folios no se pierde,
// solo deja de tener sentido seguir evaluándolo.
function estadoDe(item: ItemCalidadRow): FiltroCalidad {
  if (item.estadoRevision === "cancelado") return "cancelado";
  const ultimo = item.informes[0];
  if (!ultimo) return "sin_evaluar";
  return ultimo.aprobado ? "aprobado" : "no_aprobado";
}

// Días sin evaluar desde que se liberó a producción — null si ya tiene
// informe o si no hay fecha de liberación registrada.
function diasSinEvaluar(item: ItemCalidadRow): number | null {
  if (item.informes.length > 0 || !item.liberadoEn) return null;
  const ms = Date.now() - new Date(item.liberadoEn).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default function ItemsCalidadTable({
  items,
  pedidoId,
  puedeEvaluar,
}: {
  items: ItemCalidadRow[];
  pedidoId: string;
  puedeEvaluar: boolean;
}) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<{ item: ItemCalidadRow } | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [errorMotivo, setErrorMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [filtroCalidad, setFiltroCalidad] = useState<FiltroCalidad>("todos");
  const [historialAbierto, setHistorialAbierto] = useState<Set<string>>(new Set());
  const [previewInforme, setPreviewInforme] = useState<{
    item: ItemCalidadRow;
    informe: InformeResumen;
  } | null>(null);

  const conteos = useMemo(
    () => ({
      todos: items.length,
      aprobado: items.filter((i) => estadoDe(i) === "aprobado").length,
      no_aprobado: items.filter((i) => estadoDe(i) === "no_aprobado").length,
      sin_evaluar: items.filter((i) => estadoDe(i) === "sin_evaluar").length,
      cancelado: items.filter((i) => estadoDe(i) === "cancelado").length,
    }),
    [items]
  );

  const itemsFiltrados = useMemo(
    () => (filtroCalidad === "todos" ? items : items.filter((i) => estadoDe(i) === filtroCalidad)),
    [items, filtroCalidad]
  );

  // Agrupación visual MO -> FU, mismo patrón que Producción.
  const mo = itemsFiltrados.filter((i) => i.tipo_registro === "MO");
  const fuPorPadre = new Map<string, ItemCalidadRow[]>();
  const idsEnGrupos = new Set<string>();
  for (const item of itemsFiltrados) {
    if (item.tipo_registro === "FU" && item.parent_item_id) {
      const lista = fuPorPadre.get(item.parent_item_id) ?? [];
      lista.push(item);
      fuPorPadre.set(item.parent_item_id, lista);
    }
  }
  for (const m of mo) {
    idsEnGrupos.add(m.id);
    for (const f of fuPorPadre.get(m.id) ?? []) idsEnGrupos.add(f.id);
  }
  const fuSueltos = itemsFiltrados.filter((i) => i.tipo_registro === "FU" && !idsEnGrupos.has(i.id));

  function abrirDialogoRechazo(item: ItemCalidadRow) {
    setDialogo({ item });
    setErrorMotivo(false);
  }

  function cerrarDialogo() {
    setDialogo(null);
    setDescripcion("");
    setErrorMotivo(false);
  }

  function toggleHistorial(itemId: string) {
    setHistorialAbierto((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  // Aprobar no pide motivo: genera el informe de inmediato al hacer clic.
  async function aprobarDirecto(item: ItemCalidadRow) {
    setProcesandoId(item.id);
    setMensaje(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("crear_informe_calidad", {
      p_item_id: item.id,
      p_aprobado: true,
      p_descripcion: "",
    });
    setProcesandoId(null);
    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      return;
    }
    router.push(`/calidad/pedidos/${pedidoId}/informe/${data}`);
  }

  // No aprobar sí exige el motivo, por eso pasa por el diálogo.
  async function confirmarRechazo() {
    if (!dialogo) return;
    if (!descripcion.trim()) {
      setErrorMotivo(true);
      return;
    }
    setEnviando(true);
    setMensaje(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("crear_informe_calidad", {
      p_item_id: dialogo.item.id,
      p_aprobado: false,
      p_descripcion: descripcion,
    });
    setEnviando(false);
    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      return;
    }
    cerrarDialogo();
    router.push(`/calidad/pedidos/${pedidoId}/informe/${data}`);
  }

  // Columna "Calidad": solo el estado (Aprobado / No aprobado / Sin evaluar /
  // Cancelado). El folio y el historial de folios viven en la columna "Folio".
  function EstadoBadge({ item }: { item: ItemCalidadRow }) {
    const ultimo = item.informes[0];

    if (item.estadoRevision === "cancelado") {
      return (
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Cancelado
          </span>
          {item.motivoCancelacion && (
            <p className="mt-1 max-w-[220px] text-[11px] text-slate-500">
              Motivo: {item.motivoCancelacion}
            </p>
          )}
        </div>
      );
    }

    if (!ultimo) {
      const dias = diasSinEvaluar(item);
      const antiguo = dias !== null && dias >= DIAS_ANTIGUEDAD_ALERTA;
      return (
        <div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
              antiguo
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${antiguo ? "bg-amber-500" : "bg-slate-300"}`} />
            Sin evaluar
          </span>
          {antiguo && (
            <p className="mt-1 text-[11px] font-medium text-amber-600">
              ⚠ {dias} día{dias === 1 ? "" : "s"} esperando evaluación
            </p>
          )}
        </div>
      );
    }
    const clase = ultimo.aprobado
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-rose-200 bg-rose-50 text-rose-700";
    const punto = ultimo.aprobado ? "bg-emerald-500" : "bg-rose-500";
    return (
      <div>
        <Link
          href={`/calidad/pedidos/${pedidoId}/informe/${ultimo.id}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 ${clase}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${punto}`} />
          {ultimo.aprobado ? "Aprobado" : "No aprobado"}
        </Link>
        {!ultimo.aprobado && ultimo.descripcion && (
          <button
            type="button"
            onClick={() => setPreviewInforme({ item, informe: ultimo })}
            className="mt-1 block text-[11px] text-rose-500 underline hover:text-rose-700"
          >
            Ver motivo
          </button>
        )}
      </div>
    );
  }

  // Columna "Folio": el folio (CAL-…) del último informe del ítem, enlazado a
  // su ficha, y el historial de los folios anteriores (un ítem puede evaluarse
  // varias veces; ninguno se pierde, tampoco si el ítem se cancela).
  function FolioCelda({ item }: { item: ItemCalidadRow }) {
    const ultimo = item.informes[0];
    const historialAnterior = item.informes.slice(1);
    const abierto = historialAbierto.has(item.id);

    if (!ultimo) return <span className="text-xs text-slate-400">—</span>;

    return (
      <div>
        <Link
          href={`/calidad/pedidos/${pedidoId}/informe/${ultimo.id}`}
          title="Ver informe"
          className="whitespace-nowrap font-mono text-xs font-semibold text-slate-800 hover:text-indigo-600 hover:underline"
        >
          {ultimo.folio}
        </Link>
        {historialAnterior.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => toggleHistorial(item.id)}
              className="text-[11px] text-slate-400 underline hover:text-slate-600"
            >
              {abierto ? "Ocultar" : "Ver"} historial ({item.informes.length})
            </button>
            {abierto && (
              <ul className="mt-1 flex flex-col gap-1 border-l-2 border-slate-100 pl-2">
                {historialAnterior.map((inf) => (
                  <li key={inf.id}>
                    <button
                      type="button"
                      onClick={() => setPreviewInforme({ item, informe: inf })}
                      className="text-left text-[11px] text-slate-500 underline hover:text-slate-700"
                    >
                      {inf.folio} · {inf.aprobado ? "Aprobado" : "No aprobado"} —{" "}
                      {new Date(inf.elaborado_en).toLocaleDateString("es-MX")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  function Fila({ item, indentado }: { item: ItemCalidadRow; indentado: boolean }) {
    const estado = estadoDe(item);
    const dias = diasSinEvaluar(item);
    const antiguo = dias !== null && dias >= DIAS_ANTIGUEDAD_ALERTA;
    const franja =
      estado === "cancelado"
        ? "border-l-slate-400"
        : antiguo
          ? "border-l-amber-400"
          : estado === "aprobado"
            ? "border-l-emerald-400"
            : estado === "no_aprobado"
              ? "border-l-rose-400"
              : "border-l-slate-200";

    return (
      <tr
        className={`transition-colors hover:bg-slate-50 ${indentado ? "border-t border-slate-100" : "text-sm font-medium text-slate-900"}`}
      >
        <td className={`border-l-4 py-2 pl-2 pr-1 ${franja}`}>
          {item.imagenUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen en bucket privado vía signed URL, no next/image
            <img
              src={item.imagenUrl}
              alt=""
              className="h-8 w-8 rounded border border-slate-200 object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded border border-dashed border-slate-200 bg-slate-50" />
          )}
        </td>
        <td className="px-3 py-2 text-slate-700">{item.item_code}</td>
        <td className="px-3 py-2 text-slate-700">{item.modelo}</td>
        <td className="px-3 py-2 text-slate-700">{item.tipo_material}</td>
        <td className="px-3 py-2 text-slate-700">
          {indentado ? item.descripcion?.split("\n")[0] : item.descripcion}
        </td>
        <td className="px-3 py-2 text-slate-700">
          {item.cantidad_total} {item.unidad}
        </td>
        <td className="px-3 py-2">
          <EstadoBadge item={item} />
        </td>
        <td className="px-3 py-2">
          <FolioCelda item={item} />
        </td>
        {puedeEvaluar && (
          <td className="flex flex-wrap gap-2 px-3 py-2">
            {estado === "cancelado" ? (
              <span className="text-xs text-slate-400">—</span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => aprobarDirecto(item)}
                  disabled={procesandoId === item.id}
                  title={procesandoId === item.id ? "Generando informe..." : "Aprobar"}
                  aria-label={`Aprobar ítem ${item.item_code}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                >
                  {procesandoId === item.id ? (
                    <span className="text-xs font-semibold">…</span>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => abrirDialogoRechazo(item)}
                  disabled={procesandoId === item.id}
                  title="No aprobar"
                  aria-label={`No aprobar ítem ${item.item_code}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </>
            )}
          </td>
        )}
      </tr>
    );
  }

  const chips: [FiltroCalidad, string][] = [
    ["todos", `Todos (${conteos.todos})`],
    ["aprobado", `Aprobados (${conteos.aprobado})`],
    ["no_aprobado", `No aprobados (${conteos.no_aprobado})`],
    ["sin_evaluar", `Sin evaluar (${conteos.sin_evaluar})`],
    ["cancelado", `Cancelados (${conteos.cancelado})`],
  ];

  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {chips.map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltroCalidad(valor)}
              className={`rounded-full border px-3 py-1 font-medium transition-colors ${
                filtroCalidad === valor
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      )}

      {mensaje && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            mensaje.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 p-10 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-9 w-9 text-slate-300"
            aria-hidden="true"
          >
            <path d="M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <p className="text-sm text-slate-500">
            Ningún ítem de este pedido se ha enviado a producción todavía.
          </p>
        </div>
      ) : itemsFiltrados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Ningún ítem coincide con el filtro seleccionado.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {mo.map((m) => (
            <div
              key={m.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5"></th>
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5">Modelo</th>
                    <th className="px-3 py-2.5">Material</th>
                    <th className="px-3 py-2.5">Descripción</th>
                    <th className="px-3 py-2.5">Cant.</th>
                    <th className="px-3 py-2.5">Calidad</th>
                    <th className="px-3 py-2.5">Folio</th>
                    {puedeEvaluar && <th className="px-3 py-2.5">Aprobación</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <Fila item={m} indentado={false} />
                  {(fuPorPadre.get(m.id) ?? []).map((f) => (
                    <Fila key={f.id} item={f} indentado />
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {fuSueltos.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5"></th>
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5">Modelo</th>
                    <th className="px-3 py-2.5">Material</th>
                    <th className="px-3 py-2.5">Descripción</th>
                    <th className="px-3 py-2.5">Cant.</th>
                    <th className="px-3 py-2.5">Calidad</th>
                    <th className="px-3 py-2.5">Folio</th>
                    {puedeEvaluar && <th className="px-3 py-2.5">Aprobación</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fuSueltos.map((f) => (
                    <Fila key={f.id} item={f} indentado={false} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {dialogo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-900">
              No aprobar ítem {dialogo.item.item_code}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Indica el motivo por el que no se aprueba. Se genera un informe de calidad nuevo con
              folio propio.
            </p>
            <textarea
              value={descripcion}
              onChange={(e) => {
                setDescripcion(e.target.value);
                if (e.target.value.trim()) setErrorMotivo(false);
              }}
              placeholder="Motivo por el que no se aprueba (obligatorio)"
              rows={4}
              className={`mt-3 w-full rounded-lg border p-2 text-sm focus:outline-none ${
                errorMotivo ? "border-rose-400 focus:border-rose-500" : "border-slate-300 focus:border-slate-400"
              }`}
            />
            {errorMotivo && (
              <p className="mt-1 text-xs text-rose-600">
                Debes indicar el motivo por el que no se aprueba.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={cerrarDialogo}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRechazo}
                disabled={enviando}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-700 disabled:opacity-50"
              >
                {enviando ? "Generando..." : "Generar informe"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewInforme && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          onClick={() => setPreviewInforme(null)}
        >
          <div
            className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] text-slate-400">Folio {previewInforme.informe.folio}</p>
                <h3 className="text-sm font-semibold text-slate-900">
                  Ítem {previewInforme.item.item_code}
                  {previewInforme.item.modelo ? ` — ${previewInforme.item.modelo}` : ""}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewInforme(null)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {previewInforme.item.imagenUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- imagen en bucket privado vía signed URL, no next/image
              <img
                src={previewInforme.item.imagenUrl}
                alt=""
                className="mx-auto mt-3 h-28 w-28 rounded border border-slate-200 object-cover"
              />
            )}

            <p
              className={`mt-3 text-center text-sm font-bold tracking-wide ${
                previewInforme.informe.aprobado ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {previewInforme.informe.aprobado ? "APROBADO" : "NO APROBADO"}
            </p>
            <p className="text-center text-[11px] text-slate-400">
              {new Date(previewInforme.informe.elaborado_en).toLocaleDateString("es-MX")}
            </p>

            {!previewInforme.informe.aprobado && previewInforme.informe.descripcion && (
              <div className="mt-3 rounded-lg bg-rose-50 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">
                  Motivo
                </p>
                <p className="mt-0.5 text-xs text-rose-700">{previewInforme.informe.descripcion}</p>
              </div>
            )}

            <Link
              href={`/calidad/pedidos/${pedidoId}/informe/${previewInforme.informe.id}`}
              className="mt-4 block text-center text-xs font-medium text-slate-500 underline hover:text-slate-700"
            >
              Ver informe completo →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
