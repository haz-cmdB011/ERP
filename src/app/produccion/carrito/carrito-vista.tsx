"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { avisar } from "@/components/avisos";
import ConfirmDialog from "@/components/confirm-dialog";
import { agruparCarrito, filasCarrito, type ItemCarrito } from "@/lib/produccion/carrito";
import { quitarItems, useCarrito, vaciarCarrito } from "@/lib/produccion/carrito-navegador";
import type { DatosCarrito, DespieceCarrito, MuebleCarrito } from "@/lib/produccion/carrito-db";
import {
  PROCESO_LABELS,
  PROCESOS,
  type EncargadoEquipo,
  type EquipoProduccion,
} from "@/lib/produccion/asignaciones";
import { MAX_IDS_PANEL } from "@/lib/produccion/panel";
import AsignarLote from "../asignaciones/asignar-lote";
import BotonDesplegar from "@/components/boton-desplegar";
import DespieceEnLinea from "./despiece-en-linea";

const AVISO_SIN_DESPIECE = "Falta el despiece de algún mueble: despliégalo y guarda su despiece para poder liberar.";

// Panel de asignación de esos muebles (todos los liberados si son demasiados para la dirección).
function urlPanel(ids: string[]): string {
  return ids.length > 0 && ids.length <= MAX_IDS_PANEL
    ? `/produccion/panel?ids=${ids.join(",")}`
    : "/produccion/panel";
}

type Datos = DatosCarrito & {
  puedeEditar: boolean;
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
};

export default function CarritoVista() {
  const router = useRouter();
  const items = useCarrito();
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
  const mueblePorId = useMemo(
    () => new Map((datos?.muebles ?? []).map((m) => [m.id, m])),
    [datos]
  );

  // Libera los ítems y, si salió bien, los saca del carrito y lleva al panel de
  // asignación con los muebles recién liberados.
  async function liberar(clave: string, ids: string[]) {
    if (ids.length === 0) return;
    setLiberando(clave);
    try {
      const res = await fetch("/api/produccion/items/liberar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: ids }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisar(cuerpo.error ?? "No se pudo liberar.", "error");
        return;
      }
      const muebles = items.filter((i) => ids.includes(i.id) && i.tipo === "MO").map((i) => i.id);
      quitarItems(ids);
      avisar(`${cuerpo.liberados} ítem(s) liberado(s) a producción.`, "exito");
      // Un componente liberado solo no se asigna: sin muebles no hay a dónde ir. Con demasiados
      // muebles la lista no cabe en la dirección: se abre el panel con todo lo liberado.
      if (muebles.length > 0) router.push(urlPanel(muebles));
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
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 text-sm shadow-sm backdrop-blur">
        <span className="font-medium text-slate-900">
          {filas.length} mueble{filas.length === 1 ? "" : "s"} · {grupos.length} O.T.
        </span>
        {pendientes.length > 0 && (
          <span className="text-amber-700">{pendientes.length} por liberar</span>
        )}
        {sinDespiece.length > 0 && (
          <span className="text-amber-700">
            {sinDespiece.length} sin despiece: haz su despiece para poder liberar
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {puedeEditar && pendientes.length > 0 && (
            <button
              type="button"
              disabled={liberando !== null || faltaDespiece(pendientes)}
              title={faltaDespiece(pendientes) ? AVISO_SIN_DESPIECE : undefined}
              onClick={() => liberar("todo", idsALiberar(pendientes))}
              className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:opacity-50"
            >
              {liberando === "todo" ? "Liberando..." : `Liberar todo a producción (${pendientes.length})`}
            </button>
          )}
          {puedeEditar && asignables.length > 0 && (
            <AsignarLote
              muebles={asignables}
              equipos={equipos}
              encargados={encargados}
              etiqueta={`Asignar todo el carrito (${asignables.length})`}
              alTerminar={sacarAsignados}
            />
          )}
          <button
            type="button"
            onClick={() => setConfirmarVaciar(true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Vaciar carrito
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
      )}
      {datos && !puedeEditar && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Tu cuenta puede ver el carrito, pero liberar y asignar es del personal de Producción.
        </p>
      )}
      {datos && puedeEditar && equipos.length <= 1 && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          Da de alta tus equipos de maquila en{" "}
          <Link href="/produccion/equipos" className="font-medium underline">
            Equipos
          </Link>{" "}
          para poder asignarles trabajo.
        </p>
      )}

      {grupos.map((g) => (
        <section key={g.ot ?? "sin-ot"} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {g.ot ? (
                <Link href={`/produccion/ot/${g.ot}`} className="hover:underline">
                  O.T. {g.ot}
                </Link>
              ) : (
                "Sin O.T."
              )}
            </h2>
            <span className="text-sm text-slate-500">
              {(() => {
                const n = g.pms.reduce((s, pm) => s + pm.items.filter(visible).length, 0);
                return `${n} mueble${n === 1 ? "" : "s"}`;
              })()}
            </span>
          </div>

          {g.pms.map((pm) => {
            const idsPm = pm.items.map((i) => i.id);
            const filasPm = pm.items.filter(visible);
            const pendientesPm = filasPm.filter(porLiberar);
            const mueblesPm = asignables.filter((m) => idsPm.includes(m.id));
            return (
              <article
                key={pm.pedidoId}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <Link
                    href={`/produccion/pedidos/${pm.pedidoId}`}
                    className="font-semibold text-slate-900 hover:underline"
                  >
                    {pm.numeroPm}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {filasPm.length} mueble{filasPm.length === 1 ? "" : "s"}
                  </span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {puedeEditar && pendientesPm.length > 0 && (
                      <button
                        type="button"
                        disabled={liberando !== null || faltaDespiece(pendientesPm)}
                        title={faltaDespiece(pendientesPm) ? AVISO_SIN_DESPIECE : undefined}
                        onClick={() => liberar(pm.pedidoId, idsALiberar(pendientesPm))}
                        className="rounded-lg border border-brand-600 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-brand-500 hover:text-on-brand disabled:opacity-50"
                      >
                        {liberando === pm.pedidoId
                          ? "Liberando..."
                          : `Liberar ${pendientesPm.length} pendiente${pendientesPm.length === 1 ? "" : "s"}`}
                      </button>
                    )}
                    {puedeEditar && mueblesPm.length > 0 && (
                      <AsignarLote
                        muebles={mueblesPm}
                        equipos={equipos}
                        encargados={encargados}
                        etiqueta={`Asignar ${mueblesPm.length} a un equipo`}
                        alTerminar={sacarAsignados}
                      />
                    )}
                    {puedeEditar && mueblesPm.length > 0 && (
                      <Link
                        href={urlPanel(mueblesPm.map((m) => m.id))}
                        title="Ver la ruta de cada mueble y asignar por partes en el panel de asignación"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Ver en el panel
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => quitarItems(idsPm)}
                      className="rounded-lg px-2 py-1.5 text-sm text-slate-500 underline hover:text-slate-700"
                    >
                      Quitar PM
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
                      mueble={mueblePorId.get(i.id)}
                      despiece={despieces[i.id]}
                      alGuardarDespiece={() => void cargar()}
                      alQuitar={() => quitarItems(conComponentes([i.id]))}
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
  mueble,
  despiece,
  alGuardarDespiece,
  alQuitar,
}: {
  item: ItemCarrito;
  cargado: boolean;
  vigente: boolean | undefined;
  liberado: boolean | undefined;
  mueble: MuebleCarrito | undefined;
  despiece: DespieceCarrito | undefined;
  alGuardarDespiece: () => void;
  alQuitar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const esHijo = item.tipo === "FU";
  const faltan = mueble ? PROCESOS.filter((p) => mueble.disponible[p] > 0) : [];
  // Solo un mueble con componentes lleva despiece (los demás se asignan completos): tocar
  // su fila despliega sus componentes como despiece, para hacerlo ahí mismo.
  const conDespiece = !!despiece && despiece.componentes > 0;
  const desplegable = conDespiece && !!vigente;
  return (
    <li className={`text-sm ${abierto && desplegable ? "bg-slate-50/60" : ""}`}>
      <div
        onClick={(e) => {
          if (!desplegable || (e.target as HTMLElement).closest("a, button")) return;
          setAbierto((v) => !v);
        }}
        className={`flex items-start gap-3 px-4 py-3 ${desplegable ? "cursor-pointer hover:bg-slate-50" : ""}`}
      >
      {desplegable && (
        <BotonDesplegar
          abierto={abierto}
          alAlternar={() => setAbierto((v) => !v)}
          descripcion={`los componentes y el despiece del ítem ${item.itemCode}`}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">
          {item.itemCode}
          {item.modelo ? ` · ${item.modelo}` : ""}
          <span className="ml-2 text-xs font-normal text-slate-500">
            {esHijo ? "Componente" : "Mueble"}
          </span>
        </p>
        {item.descripcion && (
          <p className="line-clamp-2 text-xs text-slate-600">{item.descripcion.split("\n")[0]}</p>
        )}
        <p className="mt-0.5 text-xs text-slate-500">
          {item.cantidad} {item.unidad ?? ""}
          {mueble &&
            (faltan.length > 0
              ? ` · por asignar: ${faltan.map((p) => `${PROCESO_LABELS[p]} ${mueble.disponible[p]}`).join(", ")}`
              : " · todo asignado")}
        </p>
        {conDespiece && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">
              {despiece.componentes} componente{despiece.componentes === 1 ? "" : "s"} ·
            </span>
            {despiece.partes > 0 ? (
              <span className="font-medium text-emerald-700">
                Despiece listo ({despiece.partes} parte{despiece.partes === 1 ? "" : "s"})
              </span>
            ) : (
              <span className="font-medium text-amber-700">Falta el despiece</span>
            )}
          </p>
        )}
      </div>
      <Estado cargado={cargado} vigente={vigente} liberado={liberado} />
      <button
        type="button"
        onClick={alQuitar}
        aria-label={`Quitar el ítem ${item.itemCode} del carrito`}
        title="Quitar del carrito"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100"
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

function Estado({
  cargado,
  vigente,
  liberado,
}: {
  cargado: boolean;
  vigente: boolean | undefined;
  liberado: boolean | undefined;
}) {
  if (!cargado) return <span className="text-xs text-slate-500">…</span>;
  if (vigente === undefined) {
    return <span className="whitespace-nowrap text-xs font-medium text-rose-700">Ya no existe</span>;
  }
  if (!vigente) {
    return (
      <span
        className="whitespace-nowrap text-xs font-medium text-rose-700"
        title="Está en la papelera o cancelado, es de una versión anterior o el PM se canceló"
      >
        No disponible
      </span>
    );
  }
  return liberado ? (
    <span className="whitespace-nowrap text-xs font-medium text-emerald-700">Enviado a Producción</span>
  ) : (
    <span className="whitespace-nowrap text-xs font-medium text-slate-500">Pendiente</span>
  );
}
