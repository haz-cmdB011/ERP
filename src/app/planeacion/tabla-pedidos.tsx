"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import AccionesPedido from "./acciones-pedido";

export interface PedidoLista {
  id: string;
  numero_pedido: string;
  fecha_entrega: string | null;
  proyectos: { nombre: string; cliente: string } | null;
  pedido_versiones: { id: string; numero_version: number; es_version_activa: boolean }[];
}

export interface GrupoOT {
  ot: string | null;
  pedidos: PedidoLista[];
}

// Tabla de pedidos agrupados por O.T. Cada O.T. es una fila que se expande
// al hacer click para mostrar sus PM; los PM sin O.T. van sueltos.
export default function TablaPedidos({
  grupos,
  esAdmin,
}: {
  grupos: GrupoOT[];
  esAdmin: boolean;
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const columnas = esAdmin ? 6 : 5;

  function alternar(ot: string) {
    setAbiertas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(ot)) siguiente.delete(ot);
      else siguiente.add(ot);
      return siguiente;
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Pedido</th>
            <th className="px-4 py-3">Proyecto</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Entrega</th>
            <th className="px-4 py-3">Versión activa</th>
            {esAdmin && <th className="px-4 py-3"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {grupos.map((grupo) => {
            if (!grupo.ot) {
              return grupo.pedidos.map((p) => (
                <FilaPedido key={p.id} pedido={p} esAdmin={esAdmin} sangria={false} />
              ));
            }
            const ot = grupo.ot;
            const abierta = abiertas.has(ot);
            const primero = grupo.pedidos[0];
            return (
              <Fragment key={`ot-${ot}`}>
                <tr
                  onClick={() => alternar(ot)}
                  className="cursor-pointer bg-slate-50/70 transition-colors hover:bg-slate-100"
                >
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      aria-expanded={abierta}
                      className="flex items-center gap-2 text-left"
                    >
                      <span
                        className={`inline-block text-slate-400 transition-transform ${abierta ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        ▶
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        O.T.
                      </span>
                      <span className="font-mono text-sm font-semibold text-slate-900">{ot}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{primero?.proyectos?.nombre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-700">{primero?.proyectos?.cliente ?? "—"}</td>
                  <td className="px-4 py-2.5" colSpan={columnas - 3}>
                    <span className="rounded bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {grupo.pedidos.length} PM
                    </span>
                  </td>
                </tr>
                {abierta &&
                  grupo.pedidos.map((p) => (
                    <FilaPedido key={p.id} pedido={p} esAdmin={esAdmin} sangria />
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FilaPedido({
  pedido: p,
  esAdmin,
  sangria,
}: {
  pedido: PedidoLista;
  esAdmin: boolean;
  sangria: boolean;
}) {
  const activa = p.pedido_versiones.find((v) => v.es_version_activa);
  return (
    <tr className="align-top transition-colors hover:bg-slate-50">
      <td className={`py-3 pr-4 ${sangria ? "pl-12" : "pl-4"}`}>
        <Link
          href={`/planeacion/pedidos/${p.id}`}
          className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
        >
          {p.numero_pedido}
        </Link>
      </td>
      <td className="px-4 py-3 text-slate-700">{p.proyectos?.nombre ?? "—"}</td>
      <td className="px-4 py-3 text-slate-700">{p.proyectos?.cliente ?? "—"}</td>
      <td className="px-4 py-3 text-slate-700">{p.fecha_entrega ?? "—"}</td>
      <td className="px-4 py-3">
        {activa ? (
          <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            #{activa.numero_version}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      {esAdmin && (
        <td className="px-4 py-3">
          <AccionesPedido pedidoId={p.id} eliminado={false} />
        </td>
      )}
    </tr>
  );
}
