"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ImagenAmpliable from "@/components/imagen-ampliable";
import { IconoCancelado, IconoCheck, IconoReloj, IconoX } from "@/components/iconos-estado";
import ConfirmDialog from "@/components/confirm-dialog";
import { avisar } from "@/components/avisos";
import Colapsable from "@/components/colapsable";
import {
  DIAS_ANTIGUEDAD_ALERTA,
  diasSinEvaluar,
  estadoDe,
  funcionNoExiste,
  idsPorAprobar,
  type EstadoCalidad,
} from "@/lib/calidad/estado-item";
import { CATEGORIAS_DEFECTO, nombreCategoria, type CategoriaDefecto } from "@/lib/calidad/categorias";
import {
  cambiosDesdeLaPantalla,
  mensajeEvaluacionNueva,
  ultimosInformes,
} from "@/lib/calidad/verificar-evaluacion";
import { formatoFechaDMA, formatoFechaHora } from "@/lib/resumen/entrega";

export interface InformeResumen {
  id: string;
  folio: string;
  aprobado: boolean;
  elaborado_en: string;
  descripcion: string | null;
  categoria: string | null;
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
  imagenGrandeUrl: string | null;
  liberadoEn: string | null;
  estadoRevision: string | null;
  motivoCancelacion: string | null;
  // Historial completo del ítem, ordenado desc — [0] es el más reciente.
  informes: InformeResumen[];
}

type FiltroCalidad = "todos" | EstadoCalidad;
type Orden = "codigo" | "antiguos";

// Milisegundos que se espera antes de crear el folio de una aprobación: el
// folio es permanente, así que da tiempo de deshacer un toque accidental.
const ESPERA_APROBACION_MS = 5000;

const BOTON_ICONO =
  "flex h-8 w-8 items-center justify-center rounded border transition-colors max-md:h-11 max-md:w-11";

function coincide(item: ItemCalidadRow, texto: string): boolean {
  if (!texto) return true;
  const t = texto.toLowerCase();
  return [String(item.item_code), item.modelo, item.descripcion, item.tipo_material].some((v) =>
    (v ?? "").toLowerCase().includes(t)
  );
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
  const [categoria, setCategoria] = useState<CategoriaDefecto | "">("");
  const [errorMotivo, setErrorMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Aprobaciones en espera (con "Deshacer"): id del ítem -> temporizador.
  const [enEspera, setEnEspera] = useState<Set<string>>(new Set());
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [confirmandoTodos, setConfirmandoTodos] = useState(false);
  const [aprobandoTodos, setAprobandoTodos] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [filtroCalidad, setFiltroCalidad] = useState<FiltroCalidad>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("codigo");
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
    () =>
      items.filter(
        (i) => (filtroCalidad === "todos" || estadoDe(i) === filtroCalidad) && coincide(i, busqueda.trim())
      ),
    [items, filtroCalidad, busqueda]
  );

  // Agrupación visual MO -> FU, mismo patrón que Producción.
  const moBase = itemsFiltrados.filter((i) => i.tipo_registro === "MO");
  // "Más antiguos primero": los sin evaluar que llevan más días esperando arriba.
  const mo =
    orden === "antiguos"
      ? [...moBase].sort(
          (a, b) =>
            (diasSinEvaluar(b, new Date()) ?? -1) - (diasSinEvaluar(a, new Date()) ?? -1)
        )
      : moBase;
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
    setCategoria("");
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

  // Compara lo que mostraba la pantalla con la base: si alguien más ya evaluó
  // alguno de estos ítems, no se genera otro folio a ciegas. Devuelve true si se
  // puede seguir. Si no se puede comprobar (sin red), tampoco se sigue.
  async function sinEvaluacionAjena(lista: ItemCalidadRow[]): Promise<boolean> {
    try {
      const actuales = await ultimosInformes(
        createClient(),
        lista.map((i) => i.id)
      );
      const vistos = new Map(lista.map((i) => [i.id, i.informes[0]?.id ?? null]));
      const cambios = cambiosDesdeLaPantalla(vistos, actuales);
      if (cambios.length === 0) return true;
      const codigo = new Map(lista.map((i) => [i.id, i.item_code]));
      setMensaje({
        tipo: "error",
        texto: mensajeEvaluacionNueva(cambios, (id) => codigo.get(id) ?? "", new Date()),
      });
      router.refresh();
      return false;
    } catch {
      setMensaje({
        tipo: "error",
        texto: "No se pudo comprobar si alguien más ya evaluó. Revisa tu conexión e inténtalo de nuevo.",
      });
      return false;
    }
  }

  // Crea el informe aprobado y deja la tabla donde está: el folio nuevo aparece
  // en su fila y el aviso lleva al informe.
  async function crearAprobacion(item: ItemCalidadRow) {
    if (!(await sinEvaluacionAjena([item]))) return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("crear_informe_calidad", {
      p_item_id: item.id,
      p_aprobado: true,
      p_descripcion: "",
    });
    if (error) {
      setMensaje({ tipo: "error", texto: `Ítem ${item.item_code}: ${error.message}` });
    } else {
      avisar(`Ítem ${item.item_code} aprobado.`, "exito", {
        etiqueta: "Ver informe",
        alHacer: () => router.push(`/calidad/pedidos/${pedidoId}/informe/${data}`),
      });
    }
    router.refresh();
  }

  // Aprobar no pide motivo, pero el folio es permanente: se espera unos
  // segundos con "Deshacer" antes de crearlo.
  function aprobarDirecto(item: ItemCalidadRow) {
    setMensaje(null);
    setEnEspera((prev) => new Set(prev).add(item.id));
    temporizadores.current.set(
      item.id,
      setTimeout(() => {
        temporizadores.current.delete(item.id);
        setEnEspera((prev) => {
          const sig = new Set(prev);
          sig.delete(item.id);
          return sig;
        });
        void crearAprobacion(item);
      }, ESPERA_APROBACION_MS)
    );
  }

  function deshacerAprobacion(itemId: string) {
    const t = temporizadores.current.get(itemId);
    if (t) clearTimeout(t);
    temporizadores.current.delete(itemId);
    setEnEspera((prev) => {
      const sig = new Set(prev);
      sig.delete(itemId);
      return sig;
    });
  }

  // Si se sale de la pantalla con aprobaciones en espera, se envían de una vez:
  // la persona ya las había pedido.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  useEffect(() => {
    const pendientes = temporizadores.current;
    return () => {
      for (const [id, t] of pendientes) {
        clearTimeout(t);
        const item = itemsRef.current.find((i) => i.id === id);
        if (item) {
          void createClient().rpc("crear_informe_calidad", {
            p_item_id: item.id,
            p_aprobado: true,
            p_descripcion: "",
          });
        }
      }
      pendientes.clear();
    };
  }, []);

  // Aprueba de una vez todos los ítems nunca evaluados que se ven en la tabla.
  const idsAprobables = idsPorAprobar(itemsFiltrados).filter((id) => !enEspera.has(id));

  async function aprobarTodos() {
    const lista = items.filter((i) => idsAprobables.includes(i.id));
    setAprobandoTodos(true);
    setMensaje(null);
    if (!(await sinEvaluacionAjena(lista))) {
      setAprobandoTodos(false);
      setConfirmandoTodos(false);
      return;
    }
    const supabase = createClient();
    let hechos = 0;
    let fallo: string | null = null;
    const { data, error } = await supabase.rpc("crear_informes_calidad_aprobados", {
      p_item_ids: idsAprobables,
    });
    if (!error) {
      hechos = Array.isArray(data) ? data.length : idsAprobables.length;
    } else if (funcionNoExiste(error)) {
      // La migración de aprobación en bloque aún no está en la base: uno por uno.
      for (const id of idsAprobables) {
        const r = await supabase.rpc("crear_informe_calidad", { p_item_id: id, p_aprobado: true, p_descripcion: "" });
        if (r.error) {
          fallo = r.error.message;
          break;
        }
        hechos += 1;
      }
    } else {
      fallo = error.message;
    }
    setAprobandoTodos(false);
    setConfirmandoTodos(false);
    if (hechos > 0) avisar(`${hechos} ítem${hechos === 1 ? "" : "s"} aprobado${hechos === 1 ? "" : "s"}.`);
    if (fallo) {
      setMensaje({
        tipo: "error",
        texto: hechos > 0 ? `Se aprobaron ${hechos} de ${idsAprobables.length}. Se detuvo por: ${fallo}` : fallo,
      });
    }
    router.refresh();
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
    const itemRechazado = dialogo.item;
    if (!(await sinEvaluacionAjena([itemRechazado]))) {
      setEnviando(false);
      cerrarDialogo();
      return;
    }
    const supabase = createClient();
    const base = { p_item_id: itemRechazado.id, p_aprobado: false, p_descripcion: descripcion };
    let { data, error } = await supabase.rpc("crear_informe_calidad", {
      ...base,
      ...(categoria ? { p_categoria: categoria } : {}),
    });
    // Si la base aún no conoce la categoría, se guarda el informe sin ella.
    if (error && categoria && funcionNoExiste(error)) {
      ({ data, error } = await supabase.rpc("crear_informe_calidad", base));
    }
    setEnviando(false);
    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      return;
    }
    const informeId = data;
    cerrarDialogo();
    avisar(`Ítem ${itemRechazado.item_code}: informe de no aprobado generado.`, "exito", {
      etiqueta: "Ver informe",
      alHacer: () => router.push(`/calidad/pedidos/${pedidoId}/informe/${informeId}`),
    });
    router.refresh();
  }

  // Estado del ítem: Aprobado / No aprobado / Sin evaluar / Cancelado. El folio
  // y el historial de folios viven aparte (FolioCelda).
  function EstadoBadge({ item }: { item: ItemCalidadRow }) {
    const ultimo = item.informes[0];

    if (item.estadoRevision === "cancelado") {
      return (
        <div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500">
            <IconoCancelado />
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
      const dias = diasSinEvaluar(item, new Date());
      const antiguo = dias !== null && dias >= DIAS_ANTIGUEDAD_ALERTA;
      return (
        <div>
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              antiguo ? "text-amber-600" : "text-slate-500"
            }`}
          >
            <IconoReloj />
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
    return (
      <div>
        <Link
          href={`/calidad/pedidos/${pedidoId}/informe/${ultimo.id}`}
          title="Ver informe"
          className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium hover:underline ${
            ultimo.aprobado ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {ultimo.aprobado ? <IconoCheck /> : <IconoX />}
          {ultimo.aprobado ? "Aprobado" : "No aprobado"}
        </Link>
        {!ultimo.aprobado && (
          <p className="mt-0.5 text-[11px] font-medium text-rose-600">
            {nombreCategoria(ultimo.categoria) ?? "Por reinspeccionar"}
          </p>
        )}
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

  // El folio (CAL-…) del último informe del ítem, enlazado a su ficha, y el
  // historial de los folios anteriores (un ítem puede evaluarse varias veces;
  // ninguno se pierde, tampoco si el ítem se cancela).
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
          className="whitespace-nowrap font-mono text-xs text-slate-800 hover:text-brand-700 hover:underline"
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
            <Colapsable abierto={abierto}>
              <ul className="mt-1 flex flex-col gap-1 border-l-2 border-brand-200 pl-2">
                {historialAnterior.map((inf) => (
                  <li key={inf.id}>
                    <button
                      type="button"
                      onClick={() => setPreviewInforme({ item, informe: inf })}
                      className="text-left text-[11px] text-slate-500 underline hover:text-slate-700"
                    >
                      {inf.folio} · {inf.aprobado ? "Aprobado" : "No aprobado"} —{" "}
                      {formatoFechaDMA(inf.elaborado_en)}
                    </button>
                  </li>
                ))}
              </ul>
            </Colapsable>
          </div>
        )}
      </div>
    );
  }

  // Botones de aprobar / no aprobar (o "Aprobando… Deshacer" durante la espera).
  function Acciones({ item }: { item: ItemCalidadRow }) {
    if (estadoDe(item) === "cancelado") return <span className="text-xs text-slate-400">—</span>;
    if (enEspera.has(item.id)) {
      return (
        <span className="flex items-center gap-2 text-xs font-medium text-emerald-700">
          Aprobando…
          <button
            type="button"
            onClick={() => deshacerAprobacion(item.id)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 max-md:min-h-11 max-md:px-4"
          >
            Deshacer
          </button>
        </span>
      );
    }
    return (
      <>
        <button
          type="button"
          onClick={() => aprobarDirecto(item)}
          title="Aprobar"
          aria-label={`Aprobar ítem ${item.item_code}`}
          className={`${BOTON_ICONO} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
        >
          <IconoCheck />
        </button>
        <button
          type="button"
          onClick={() => abrirDialogoRechazo(item)}
          title="No aprobar"
          aria-label={`No aprobar ítem ${item.item_code}`}
          className={`${BOTON_ICONO} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`}
        >
          <IconoX />
        </button>
      </>
    );
  }

  function franjaDe(item: ItemCalidadRow): string {
    const estado = estadoDe(item);
    const dias = diasSinEvaluar(item, new Date());
    const antiguo = dias !== null && dias >= DIAS_ANTIGUEDAD_ALERTA;
    return estado === "cancelado"
      ? "border-l-slate-400"
      : antiguo
        ? "border-l-amber-400"
        : estado === "aprobado"
          ? "border-l-emerald-400"
          : estado === "no_aprobado"
            ? "border-l-rose-400"
            : "border-l-slate-200";
  }

  function Miniatura({ item, clase }: { item: ItemCalidadRow; clase: string }) {
    return item.imagenUrl ? (
      <ImagenAmpliable
        url={item.imagenUrl}
        urlGrande={item.imagenGrandeUrl}
        alt={`Ítem ${item.item_code}${item.modelo ? ` — ${item.modelo}` : ""}`}
        className={clase}
      />
    ) : (
      <div className={`${clase} rounded border border-dashed border-slate-200 bg-slate-50`} />
    );
  }

  function Fila({ item, indentado }: { item: ItemCalidadRow; indentado: boolean }) {
    return (
      <tr
        key={item.id}
        className={`transition-colors hover:bg-slate-50 ${indentado ? "border-t border-slate-100" : "text-sm font-medium text-slate-900"}`}
      >
        <td className={`border-l-4 py-2 pl-2 pr-1 ${franjaDe(item)}`}>
          <Miniatura item={item} clase="h-8 w-8" />
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
        <td className="px-3 py-2">{EstadoBadge({ item })}</td>
        <td className="px-3 py-2">{FolioCelda({ item })}</td>
        {puedeEvaluar && <td className="flex flex-wrap gap-2 px-3 py-2">{Acciones({ item })}</td>}
      </tr>
    );
  }

  // Misma información que la fila, en tarjeta para el celular o la tableta.
  function Tarjeta({ item, indentado }: { item: ItemCalidadRow; indentado: boolean }) {
    return (
      <li
        key={item.id}
        className={`flex flex-col gap-3 border-l-4 p-3 ${franjaDe(item)} ${indentado ? "ml-4 border-t border-slate-100" : ""}`}
      >
        <div className="flex items-start gap-3">
          <Miniatura item={item} clase="h-12 w-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              Ítem {item.item_code}
              {item.modelo ? ` · ${item.modelo}` : ""}
            </p>
            <p className="line-clamp-2 text-xs text-slate-600">{item.descripcion?.split("\n")[0]}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.cantidad_total} {item.unidad}
              {item.tipo_material ? ` · ${item.tipo_material}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          {EstadoBadge({ item })}
          {FolioCelda({ item })}
        </div>
        {puedeEvaluar && <div className="flex flex-wrap gap-2">{Acciones({ item })}</div>}
      </li>
    );
  }

  const ENCABEZADO = (
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
  );

  const chips: [FiltroCalidad, string][] = [
    ["todos", `Todos (${conteos.todos})`],
    ["aprobado", `Aprobados (${conteos.aprobado})`],
    ["no_aprobado", `Por reinspeccionar (${conteos.no_aprobado})`],
    ["sin_evaluar", `Sin evaluar (${conteos.sin_evaluar})`],
    ["cancelado", `Cancelados (${conteos.cancelado})`],
  ];

  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {chips.map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltroCalidad(valor)}
                className={`rounded border px-3 py-1 font-medium transition-colors max-md:min-h-11 ${
                  filtroCalidad === valor
                    ? "border-brand-600 bg-brand-500 text-on-brand"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar ítem, modelo o descripción…"
              aria-label="Buscar en los ítems"
              className="min-h-10 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-600 focus:outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={orden === "antiguos"}
                onChange={(e) => setOrden(e.target.checked ? "antiguos" : "codigo")}
                className="h-4 w-4 accent-brand-600"
              />
              Más antiguos sin evaluar primero
            </label>
          </div>
        </div>
      )}

      {puedeEvaluar && idsAprobables.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span>
            <strong>{idsAprobables.length}</strong> ítem{idsAprobables.length === 1 ? "" : "s"} sin evaluar
            {filtroCalidad === "todos" && !busqueda.trim() ? "" : " en esta vista"}
          </span>
          <button
            type="button"
            onClick={() => setConfirmandoTodos(true)}
            disabled={aprobandoTodos}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 max-md:min-h-11 max-md:px-4"
          >
            Aprobar los {idsAprobables.length}
          </button>
          <span className="text-xs text-emerald-800">Cada uno recibe su propio folio.</span>
        </div>
      )}
      <ConfirmDialog
        open={confirmandoTodos}
        title={`Aprobar ${idsAprobables.length} ítem${idsAprobables.length === 1 ? "" : "s"}`}
        message="Se genera un informe aprobado con folio propio para cada uno. Los folios son permanentes: no se pueden borrar después."
        confirmLabel={aprobandoTodos ? "Aprobando…" : `Aprobar ${idsAprobables.length}`}
        busy={aprobandoTodos}
        onConfirm={() => void aprobarTodos()}
        onCancel={() => setConfirmandoTodos(false)}
      />

      {mensaje && (
        <div
          role={mensaje.tipo === "error" ? "alert" : "status"}
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
          Ningún ítem coincide con lo que elegiste.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {mo.map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-xs">
                  {ENCABEZADO}
                  <tbody className="divide-y divide-slate-100">
                    {Fila({ item: m, indentado: false })}
                    {(fuPorPadre.get(m.id) ?? []).map((f) => Fila({ item: f, indentado: true }))}
                  </tbody>
                </table>
              </div>
              <ul className="md:hidden">
                {Tarjeta({ item: m, indentado: false })}
                {(fuPorPadre.get(m.id) ?? []).map((f) => Tarjeta({ item: f, indentado: true }))}
              </ul>
            </div>
          ))}

          {fuSueltos.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-xs">
                  {ENCABEZADO}
                  <tbody className="divide-y divide-slate-100">
                    {fuSueltos.map((f) => Fila({ item: f, indentado: false }))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-slate-100 md:hidden">
                {fuSueltos.map((f) => Tarjeta({ item: f, indentado: false }))}
              </ul>
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
            <fieldset className="mt-3">
              <legend className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Tipo de defecto (opcional)
              </legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {CATEGORIAS_DEFECTO.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    aria-pressed={categoria === c.valor}
                    onClick={() => setCategoria(categoria === c.valor ? "" : c.valor)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      categoria === c.valor
                        ? "border-rose-500 bg-rose-50 text-rose-700"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
            </fieldset>
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
              <div className="mt-3 flex justify-center">
                <ImagenAmpliable
                  url={previewInforme.item.imagenUrl}
                  urlGrande={previewInforme.item.imagenGrandeUrl}
                  alt={`Ítem ${previewInforme.item.item_code}`}
                  className="h-28 w-28"
                />
              </div>
            )}

            <p
              className={`mt-3 text-center text-sm font-bold tracking-wide ${
                previewInforme.informe.aprobado ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {previewInforme.informe.aprobado ? "APROBADO" : "NO APROBADO"}
            </p>
            <p className="text-center text-[11px] text-slate-400">
              {formatoFechaHora(previewInforme.informe.elaborado_en)}
            </p>

            {!previewInforme.informe.aprobado && previewInforme.informe.descripcion && (
              <div className="mt-3 rounded-lg bg-rose-50 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">
                  Motivo
                  {nombreCategoria(previewInforme.informe.categoria)
                    ? ` · ${nombreCategoria(previewInforme.informe.categoria)}`
                    : ""}
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
