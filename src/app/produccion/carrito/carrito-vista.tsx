"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { avisar } from "@/components/avisos";
import ConfirmDialog from "@/components/confirm-dialog";
import { agruparCarrito, type ItemCarrito } from "@/lib/produccion/carrito";
import { quitarItems, useCarrito, vaciarCarrito } from "@/lib/produccion/carrito-navegador";
import type { DatosCarrito, MuebleCarrito } from "@/lib/produccion/carrito-db";
import {
  PROCESO_LABELS,
  PROCESOS,
  type EncargadoEquipo,
  type EquipoProduccion,
} from "@/lib/produccion/asignaciones";
import AsignarLote from "../asignaciones/asignar-lote";

type Datos = DatosCarrito & {
  puedeEditar: boolean;
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
};

export default function CarritoVista() {
  const items = useCarrito();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const estadoDe = (id: string) => datos?.estados[id];
  const mueblePorId = useMemo(
    () => new Map((datos?.muebles ?? []).map((m) => [m.id, m])),
    [datos]
  );

  async function liberar(pedidoId: string, ids: string[]) {
    if (ids.length === 0) return;
    setLiberando(pedidoId);
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
      avisar(`${cuerpo.liberados} ítem(s) liberado(s) a producción.`, "exito");
      await cargar();
    } catch {
      avisar("Error de red al liberar.", "error");
    } finally {
      setLiberando(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        <p>El carrito está vacío.</p>
        <p>
          Entra a un PM, marca muebles o componentes y usa{" "}
          <span className="font-medium text-slate-700">Agregar al carrito</span>.
        </p>
        <Link href="/produccion" className="font-medium text-brand-700 hover:underline">
          Ir a Pedidos →
        </Link>
      </div>
    );
  }

  const asignables: MuebleCarrito[] = datos?.muebles ?? [];
  const puedeEditar = datos?.puedeEditar ?? false;
  const equipos = datos?.equipos ?? [];
  const encargados = datos?.encargados ?? [];
  const pendientesTotal = items.filter((i) => estadoDe(i.id)?.vigente && !estadoDe(i.id)?.liberado).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 text-sm shadow-sm backdrop-blur">
        <span className="font-medium text-slate-900">
          {items.length} ítem{items.length === 1 ? "" : "s"} · {grupos.length} O.T.
        </span>
        {pendientesTotal > 0 && (
          <span className="text-amber-700">{pendientesTotal} por liberar</span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {puedeEditar && asignables.length > 0 && (
            <AsignarLote
              muebles={asignables}
              equipos={equipos}
              encargados={encargados}
              etiqueta={`Asignar todo el carrito (${asignables.length})`}
              alTerminar={cargar}
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
              {g.total} ítem{g.total === 1 ? "" : "s"}
            </span>
          </div>

          {g.pms.map((pm) => {
            const idsPm = pm.items.map((i) => i.id);
            const porLiberar = pm.items.filter(
              (i) => estadoDe(i.id)?.vigente && !estadoDe(i.id)?.liberado
            );
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
                    {pm.items.length} ítem{pm.items.length === 1 ? "" : "s"}
                  </span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {puedeEditar && porLiberar.length > 0 && (
                      <button
                        type="button"
                        disabled={liberando === pm.pedidoId}
                        onClick={() =>
                          liberar(
                            pm.pedidoId,
                            porLiberar.map((i) => i.id)
                          )
                        }
                        className="rounded-lg border border-brand-600 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-brand-500 hover:text-on-brand disabled:opacity-50"
                      >
                        {liberando === pm.pedidoId
                          ? "Liberando..."
                          : `Liberar ${porLiberar.length} pendiente${porLiberar.length === 1 ? "" : "s"}`}
                      </button>
                    )}
                    {puedeEditar && mueblesPm.length > 0 && (
                      <AsignarLote
                        muebles={mueblesPm}
                        equipos={equipos}
                        encargados={encargados}
                        etiqueta={`Asignar ${mueblesPm.length} a un equipo`}
                        alTerminar={cargar}
                      />
                    )}
                    {puedeEditar && mueblesPm.length > 0 && (
                      <Link
                        href={`/produccion/pedidos/${pm.pedidoId}/asignaciones`}
                        title="Asignar por partes del despiece, ver la ruta y el avance"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Ruta y partes
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
                  {pm.items.map((i) => (
                    <FilaCarrito
                      key={i.id}
                      item={i}
                      cargado={!!datos}
                      vigente={estadoDe(i.id)?.vigente}
                      liberado={estadoDe(i.id)?.liberado}
                      mueble={mueblePorId.get(i.id)}
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
}: {
  item: ItemCarrito;
  cargado: boolean;
  vigente: boolean | undefined;
  liberado: boolean | undefined;
  mueble: MuebleCarrito | undefined;
}) {
  const esHijo = item.tipo === "FU";
  const faltan = mueble ? PROCESOS.filter((p) => mueble.disponible[p] > 0) : [];
  return (
    <li className={`flex items-start gap-3 px-4 py-3 text-sm ${esHijo ? "bg-slate-50/50 pl-10" : ""}`}>
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
      </div>
      <Estado cargado={cargado} vigente={vigente} liberado={liberado} />
      <button
        type="button"
        onClick={() => quitarItems([item.id])}
        aria-label={`Quitar el ítem ${item.itemCode} del carrito`}
        title="Quitar del carrito"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100"
      >
        ✕
      </button>
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
  if (!cargado) return <span className="text-xs text-slate-400">…</span>;
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
