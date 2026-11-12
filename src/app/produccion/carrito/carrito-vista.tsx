"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { avisar } from "@/components/avisos";
import ConfirmDialog from "@/components/confirm-dialog";
import { agruparCarrito, filasCarrito, type ItemCarrito } from "@/lib/produccion/carrito";
import {
  elegirRuta,
  olvidarRutas,
  quitarItems,
  useCarrito,
  useRutasCarrito,
  vaciarCarrito,
} from "@/lib/produccion/carrito-navegador";
import type { DatosCarrito, DespieceCarrito, MuebleCarrito, RutaCarrito } from "@/lib/produccion/carrito-db";
import {
  type EncargadoEquipo,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import { etiquetaPaso, type PasoRuta } from "@/lib/produccion/ruta";
import EditarRuta from "../pedidos/[id]/asignaciones/editar-ruta";
import { COLORES_MATERIAL, InsigniaMaterial } from "../material-parte";
import { MAX_IDS_PANEL } from "@/lib/produccion/panel";
import AsignarLote from "../asignaciones/asignar-lote";
import BotonDesplegar from "@/components/boton-desplegar";
import DespieceEnLinea from "./despiece-en-linea";

const AVISO_SIN_DESPIECE = "Falta el despiece de algún mueble: despliégalo y guarda su despiece para poder liberar.";

// Panel de asignación de lo recién liberado: por ids si caben en la dirección y, si no, por la
// marca de tiempo de la liberación (sin tope de cantidad).
function urlPanel(ids: string[], liberadoEn?: string): string {
  if (ids.length > 0 && ids.length <= MAX_IDS_PANEL) return `/produccion/panel?ids=${ids.join(",")}`;
  return liberadoEn ? `/produccion/panel?lote=${encodeURIComponent(liberadoEn)}` : "/produccion/panel";
}

type Datos = DatosCarrito & {
  puedeEditar: boolean;
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
};

export default function CarritoVista() {
  const router = useRouter();
  const items = useCarrito();
  // Rutas elegidas para muebles que aún no se liberan (se guardan al liberar).
  const rutasElegidas = useRutasCarrito();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "todo" o el id del PM que se está liberando.
  const [liberando, setLiberando] = useState<string | null>(null);
  const [confirmarVaciar, setConfirmarVaciar] = useState(false);

  // Cambia solo cuando cambian los ítems del carrito, no en cada render.
  const clave = useMemo(() => items.map((i) => i.id).sort().join(","), [items]);

  const cargar = useCallback(async () => {
    if (!clave) {
      setDatos(null);
      return;
    }
    try {
      const res = await fetch("/api/produccion/carrito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: clave.split(",") }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(cuerpo.error ?? "No se pudo leer el estado del carrito.");
        return;
      }
      setError(null);
      setDatos(cuerpo as Datos);
    } catch {
      setError("Error de red al leer el estado del carrito.");
    }
  }, [clave]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de datos al cambiar el carrito
    void cargar();
  }, [cargar]);

  const grupos = useMemo(() => agruparCarrito(items), [items]);
  // Los componentes viajan con su mueble (se liberan con él) pero no salen como filas.
  const componentesDe = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const i of items) {
      if (i.tipo !== "FU" || !i.padreId) continue;
      mapa.set(i.padreId, [...(mapa.get(i.padreId) ?? []), i.id]);
    }
    return mapa;
  }, [items]);
  // Las filas que se ven: los muebles y algún componente suelto (sin su mueble en el carrito).
  const idsVisibles = useMemo(() => new Set(filasCarrito(items).map((i) => i.id)), [items]);
  const visible = (i: ItemCarrito) => idsVisibles.has(i.id);
  // Un mueble con sus componentes.
  const conComponentes = (ids: string[]) => ids.flatMap((id) => [id, ...(componentesDe.get(id) ?? [])]);
  const estadoDe = (id: string) => datos?.estados[id];

  // Libera los ítems y, si salió bien, los saca del carrito y lleva al panel de
  // asignación con los muebles recién liberados.
  async function liberar(clave: string, ids: string[]) {
    if (ids.length === 0) return;
    setLiberando(clave);
    try {
      const res = await fetch("/api/produccion/items/liberar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: ids,
          rutas: Object.fromEntries(ids.filter((id) => rutasElegidas[id]).map((id) => [id, rutasElegidas[id]])),
        }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisar(cuerpo.error ?? "No se pudo liberar.", "error");
        return;
      }
      const muebles = items.filter((i) => ids.includes(i.id) && i.tipo === "MO").map((i) => i.id);
      quitarItems(ids);
      olvidarRutas(ids);
      avisar(`${cuerpo.liberados} ítem(s) liberado(s) a producción.`, "exito");
      for (const aviso of (cuerpo.avisos ?? []) as string[]) {
        avisar(`La ruta no se guardó: ${aviso} Cámbiala con "Ruta" en el panel.`, "error");
      }
      // Un componente liberado solo no se asigna: sin muebles no hay a dónde ir.
      if (muebles.length > 0) router.push(urlPanel(muebles, cuerpo.liberadoEn));
    } catch {
      avisar("Error de red al liberar.", "error");
    } finally {
      setLiberando(null);
    }
  }

  // Lo asignado sale del carrito, con sus componentes.
  function sacarAsignados(idsMuebles: string[]) {
    if (idsMuebles.length === 0) return;
    const fuera = new Set(idsMuebles);
    quitarItems([...fuera, ...items.filter((i) => i.padreId && fuera.has(i.padreId)).map((i) => i.id)]);
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        <p>El carrito está vacío.</p>
        <p>
          Entra a un PM, marca muebles y usa{" "}
          <span className="font-medium text-slate-700">Agregar al carrito</span>.
        </p>
        <Link href="/produccion/pedidos" className="font-medium text-brand-700 hover:underline">
          Ir a Pedidos →
        </Link>
      </div>
    );
  }

  const asignables: MuebleCarrito[] = datos?.muebles ?? [];
  const puedeEditar = datos?.puedeEditar ?? false;
  const equipos = datos?.equipos ?? [];
  const encargados = datos?.encargados ?? [];
  const despieces = datos?.despieces ?? {};
  const rutas = datos?.rutas ?? {};
  const porLiberar = (i: ItemCarrito) => !!estadoDe(i.id)?.vigente && !estadoDe(i.id)?.liberado;
  // Lo que se libera de unas filas: ellas y sus componentes que sigan pendientes.
  const idsALiberar = (filas: ItemCarrito[]) => {
    const ids = new Set(conComponentes(filas.map((f) => f.id)));
    return items.filter((i) => ids.has(i.id) && porLiberar(i)).map((i) => i.id);
  };
  const filas = items.filter(visible);
  const pendientes = filas.filter(porLiberar);
  // Muebles con componentes que todavía no tienen su despiece guardado.
  const sinDespiece = filas.filter((i) => (despieces[i.id]?.componentes ?? 0) > 0 && !despieces[i.id]?.partes);
  // No se libera nada mientras un mueble de lo que se libera no tenga su despiece (la base también lo exige).
  const faltaDespiece = (lista: ItemCarrito[]) => lista.some((i) => sinDespiece.includes(i));

  return (
    <div className="flex flex-col gap-5">
      {/* Barra fija: cuántos hay, lo que detiene la liberación y las dos acciones del carrito. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <p className="text-base font-semibold text-slate-900 tabular-nums">
          {filas.length} mueble{filas.length === 1 ? "" : "s"}
          {sinDespiece.length > 0 && (
            <span className="ml-3 text-sm font-medium text-amber-700">
              {sinDespiece.length} sin despiece
            </span>
          )}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmarVaciar(true)}
            className="px-2 py-2 text-sm text-slate-500 hover:text-slate-800"
          >
            Vaciar
          </button>
          {puedeEditar && asignables.length > 0 && (
            <AsignarLote
              muebles={asignables}
              equipos={equipos}
              encargados={encargados}
              etiqueta={`Asignar (${asignables.length})`}
              alTerminar={sacarAsignados}
            />
          )}
          {puedeEditar && pendientes.length > 0 && (
            <button
              type="button"
              disabled={liberando !== null || faltaDespiece(pendientes)}
              title={faltaDespiece(pendientes) ? AVISO_SIN_DESPIECE : undefined}
              onClick={() => liberar("todo", idsALiberar(pendientes))}
              className="min-h-11 rounded-lg bg-brand-500 px-5 py-2 text-base font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:opacity-50"
            >
              {liberando === "todo" ? "Liberando…" : `Liberar (${pendientes.length})`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
      )}
      {datos && !puedeEditar && (
        <p className="text-sm text-slate-600">Solo Producción puede liberar y asignar.</p>
      )}
      {datos && puedeEditar && equipos.length <= 1 && (
        <p className="text-sm text-slate-600">
          Sin equipos de maquila todavía.{" "}
          <Link href="/produccion/equipos" className="font-medium text-sky-700 underline">
            Dar de alta equipos
          </Link>
        </p>
      )}

      {grupos.map((g) => (
        <section key={g.ot ?? "sin-ot"} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-500">
            {g.ot ? (
              <Link href={`/produccion/ot/${g.ot}`} className="hover:text-slate-900 hover:underline">
                O.T. {g.ot}
              </Link>
            ) : (
              "Sin O.T."
            )}
          </h2>

          {g.pms.map((pm) => {
            const idsPm = pm.items.map((i) => i.id);
            const filasPm = pm.items.filter(visible);
            const pendientesPm = filasPm.filter(porLiberar);
            // Con un solo PM, la barra de arriba ya libera lo mismo.
            const liberarAqui = puedeEditar && pendientesPm.length > 0 && grupos.flatMap((x) => x.pms).length > 1;
            return (
              <article
                key={pm.pedidoId}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5">
                  <Link
                    href={`/produccion/pedidos/${pm.pedidoId}`}
                    className="font-semibold text-slate-900 hover:underline"
                  >
                    {pm.numeroPm}
                  </Link>
                  <div className="ml-auto flex items-center gap-1">
                    {liberarAqui && (
                      <button
                        type="button"
                        disabled={liberando !== null || faltaDespiece(pendientesPm)}
                        title={faltaDespiece(pendientesPm) ? AVISO_SIN_DESPIECE : undefined}
                        onClick={() => liberar(pm.pedidoId, idsALiberar(pendientesPm))}
                        className="rounded-lg border border-brand-600 px-3 py-1.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-brand-500 hover:text-on-brand disabled:opacity-50"
                      >
                        {liberando === pm.pedidoId ? "Liberando…" : `Liberar (${pendientesPm.length})`}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        quitarItems(idsPm);
                        olvidarRutas(idsPm);
                      }}
                      className="px-2 py-1.5 text-sm text-slate-500 hover:text-slate-800"
                    >
                      Quitar
                    </button>
                  </div>
                </header>
                <ul className="divide-y divide-slate-100">
                  {filasPm.map((i) => (
                    <FilaCarrito
                      key={i.id}
                      item={i}
                      cargado={!!datos}
                      vigente={estadoDe(i.id)?.vigente}
                      liberado={estadoDe(i.id)?.liberado}
                      despiece={despieces[i.id]}
                      ruta={rutas[i.id]}
                      rutaElegida={rutasElegidas[i.id]}
                      puedeEditar={puedeEditar}
                      alGuardarDespiece={() => void cargar()}
                      alGuardarRuta={() => void cargar()}
                      alQuitar={() => {
                        quitarItems(conComponentes([i.id]));
                        olvidarRutas([i.id]);
                      }}
                    />
                  ))}
                </ul>
              </article>
            );
          })}
        </section>
      ))}

      <ConfirmDialog
        open={confirmarVaciar}
        title="Vaciar el carrito"
        message={`¿Quitar los ${items.length} ítems del carrito? No se libera ni se cancela nada: solo se vacía esta lista.`}
        confirmLabel="Vaciar"
        destructive
        onConfirm={() => {
          vaciarCarrito();
          olvidarRutas(items.map((i) => i.id));
          setConfirmarVaciar(false);
        }}
        onCancel={() => setConfirmarVaciar(false)}
      />
    </div>
  );
}

function FilaCarrito({
  item,
  cargado,
  vigente,
  liberado,
  despiece,
  ruta,
  rutaElegida,
  puedeEditar,
  alGuardarDespiece,
  alGuardarRuta,
  alQuitar,
}: {
  item: ItemCarrito;
  cargado: boolean;
  vigente: boolean | undefined;
  liberado: boolean | undefined;
  despiece: DespieceCarrito | undefined;
  ruta: RutaCarrito | undefined;
  rutaElegida: Proceso[] | undefined;
  puedeEditar: boolean;
  alGuardarDespiece: () => void;
  alGuardarRuta: () => void;
  alQuitar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const esHijo = item.tipo === "FU";
  // Solo un mueble con componentes lleva despiece: tocar su fila lo despliega para hacerlo ahí.
  const conDespiece = !!despiece && despiece.componentes > 0;
  const faltaDespiece = conDespiece && despiece.partes === 0;
  const desplegable = conDespiece && !!vigente;
  // El borde izquierdo dice qué le falta: despiece (ámbar) o ya está en Producción (verde).
  const borde = !vigente
    ? "border-l-rose-400"
    : faltaDespiece
      ? "border-l-amber-400"
      : liberado
        ? "border-l-emerald-500"
        : "border-l-transparent";
  return (
    <li className={`border-l-4 text-sm ${borde} ${abierto && desplegable ? "bg-slate-50/60" : ""}`}>
      <div
        onClick={(e) => {
          // Los clics dentro del diálogo de la ruta (se abre dentro de la fila) no cuentan.
          const t = e.target as HTMLElement;
          if (!desplegable || t.closest('a, button, input, select, textarea, [role="dialog"]')) return;
          setAbierto((v) => !v);
        }}
        className={`flex items-start gap-3 py-3 pr-3 pl-3 ${desplegable ? "cursor-pointer hover:bg-brand-50/60" : ""}`}
      >
        {desplegable ? (
          <BotonDesplegar
            abierto={abierto}
            alAlternar={() => setAbierto((v) => !v)}
            descripcion={`el despiece del ítem ${item.itemCode}`}
          />
        ) : (
          <span aria-hidden className="w-6 shrink-0 pointer-coarse:w-11" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            {/* Sin cortar: con la flecha y la ✕ a 44 px para el dedo, el modelo quedaba en "PG-…". */}
            <p className="min-w-0 flex-1 break-words text-base font-semibold leading-snug text-slate-900">
              <span className="text-slate-400 tabular-nums">{item.itemCode}</span> {item.modelo ?? "Sin modelo"}
              {esHijo && <span className="ml-2 text-xs font-normal text-slate-500">Componente</span>}
            </p>
            <span className="shrink-0 text-base font-semibold text-slate-900 tabular-nums">
              {item.cantidad} <span className="text-xs font-normal text-slate-500">{item.unidad ?? ""}</span>
            </span>
          </div>
          {/* En celular el estado va aquí, debajo del modelo: a la derecha le dejaba al modelo unos 50 px. */}
          <Estado cargado={cargado} vigente={vigente} liberado={liberado} className="block sm:hidden" />
          {item.descripcion && (
            <p className="line-clamp-2 break-words text-xs text-slate-500" title={item.descripcion}>
              {item.descripcion.split("\n")[0]}
            </p>
          )}
          {!esHijo && vigente && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              {ruta && (
                <RutaDelMueble
                  item={item}
                  ruta={ruta}
                  liberado={!!liberado}
                  elegida={rutaElegida}
                  puedeEditar={puedeEditar}
                  alGuardar={alGuardarRuta}
                />
              )}
              {conDespiece &&
                (faltaDespiece ? (
                  <button
                    type="button"
                    onClick={() => setAbierto(true)}
                    className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Hacer despiece
                  </button>
                ) : (
                  <span
                    role="img"
                    className="flex items-center gap-1"
                    title={`Despiece: ${despiece.partes} parte${despiece.partes === 1 ? "" : "s"}`}
                    aria-label={`Despiece con ${despiece.materiales.map((t) => COLORES_MATERIAL[t].etiqueta).join(", ")}`}
                  >
                    {despiece.materiales.map((t) => (
                      <InsigniaMaterial key={t} tipo={t} tamano="sm" />
                    ))}
                  </span>
                ))}
            </div>
          )}
        </div>
        <Estado cargado={cargado} vigente={vigente} liberado={liberado} className="hidden sm:inline" />
        <button
          type="button"
          onClick={alQuitar}
          aria-label={`Quitar el ítem ${item.itemCode} del carrito`}
          title="Quitar del carrito"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 pointer-coarse:h-11 pointer-coarse:w-11"
        >
          ✕
        </button>
      </div>
      {abierto && desplegable && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:pl-12">
          <DespieceEnLinea
            itemId={item.id}
            alGuardar={() => {
              setAbierto(false);
              alGuardarDespiece();
            }}
          />
        </div>
      )}
    </li>
  );
}

// La ruta del mueble completo como estaciones en orden; tocarla la cambia. Por liberar, la
// elegida se queda en el aparato y se guarda al liberar; ya liberado, se guarda en la base.
// Sin elegir, la sugerida.
function RutaDelMueble({
  item,
  ruta,
  liberado,
  elegida,
  puedeEditar,
  alGuardar,
}: {
  item: ItemCarrito;
  ruta: RutaCarrito;
  liberado: boolean;
  elegida: Proceso[] | undefined;
  puedeEditar: boolean;
  alGuardar: () => void;
}) {
  const local = !liberado && !!elegida;
  const pasos: PasoRuta[] = local ? elegida.map((proceso) => ({ id: null, proceso })) : ruta.pasos;
  const estaciones =
    pasos.length === 0 ? (
      <span className="text-xs text-slate-500">Sin ruta</span>
    ) : (
      <ol className="flex flex-wrap items-center gap-y-1" aria-label={`Ruta del ítem ${item.itemCode}`}>
        {pasos.map((p, i) => (
          <li key={p.id ?? `${p.proceso}-${i}`} className="flex items-center">
            {i > 0 && <span aria-hidden className="mx-1 h-px w-2.5 bg-slate-300" />}
            <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pr-2 pl-0.5 text-xs font-medium text-slate-700">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold tabular-nums text-slate-500">
                {i + 1}
              </span>
              {etiquetaPaso(pasos, i)}
            </span>
          </li>
        ))}
      </ol>
    );
  if (!puedeEditar) return estaciones;
  return (
    <EditarRuta
      itemId={item.id}
      descripcion={`${item.numeroPm} · ítem ${item.itemCode}${item.modelo ? ` · ${item.modelo}` : ""}`}
      conPartes={ruta.deAntes}
      ruta={pasos}
      version={ruta.version}
      aplica={ruta.aplica}
      bloqueados={liberado ? ruta.bloqueados : pasos.map(() => false)}
      alGuardar={alGuardar}
      alElegir={liberado ? undefined : (nuevos) => elegirRuta(item.id, nuevos.map((x) => x.proceso))}
      titulo="Cambiar la ruta"
      className="group flex items-center gap-1.5 rounded-lg p-0.5 text-left transition-colors hover:bg-sky-50"
    >
      {estaciones}
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-sky-700"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 20h4L19 9l-4-4L4 16z" />
      </svg>
      <span className="sr-only">Cambiar la ruta</span>
    </EditarRuta>
  );
}

function Estado({
  cargado,
  vigente,
  liberado,
  className = "",
}: {
  cargado: boolean;
  vigente: boolean | undefined;
  liberado: boolean | undefined;
  className?: string;
}) {
  const base = `shrink-0 whitespace-nowrap text-xs font-medium ${className}`;
  if (!cargado) return <span className={`${base} text-slate-400`}>…</span>;
  if (vigente === undefined) return <span className={`${base} text-rose-700`}>Ya no existe</span>;
  if (!vigente) {
    return (
      <span className={`${base} text-rose-700`} title="En la papelera, cancelado o de una versión anterior del PM">
        No disponible
      </span>
    );
  }
  return liberado ? (
    <span className={`${base} text-emerald-700`}>Liberado</span>
  ) : (
    <span className={`${base} text-slate-500`}>Por liberar</span>
  );
}
