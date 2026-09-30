import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import {
  AREAS_COBRO,
  cargarPmContraCobrado,
  resumirPorPm,
  type ResumenPm,
} from "@/lib/estimaciones/pm-cobrado";
import BarraAvance from "./barra-avance";
import { AREA_RECIBO_LABELS } from "@/lib/estimaciones/discrepancias-db";

export const metadata: Metadata = { title: "PM contra cobrado" };

function coincide(r: ResumenPm, texto: string): boolean {
  const t = texto.toLowerCase();
  return [r.numeroPedido, r.ordenTrabajo, r.proyecto].some((v) => (v ?? "").toLowerCase().includes(t));
}

function conDiferencias(r: ResumenPm): boolean {
  return r.excedidos > 0 || r.fueraDelPm > 0 || r.discrepanciasPendientes > 0;
}

// Por PM: cuánto de lo que declaró Planeación ya se cobró en cada área, y qué
// hay que revisar (modelos cobrados de más, fuera del PM, discrepancias sin
// decidir).
export default async function PmCobradoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ver?: string }>;
}) {
  const { q, ver } = await searchParams;
  const busqueda = q?.trim() ?? "";
  const soloDiferencias = ver === "diferencias";

  const supabase = await createClient();
  if (!puedeVerPrecioSugerido(await getPerfilActual(supabase))) {
    redirect("/estimaciones");
  }

  const { filas, error } = await cargarPmContraCobrado(supabase);
  const todos = resumirPorPm(filas);
  const visibles = todos
    .filter((r) => !busqueda || coincide(r, busqueda))
    .filter((r) => !soloDiferencias || conDiferencias(r));
  const totalConDiferencias = todos.filter(conDiferencias).length;

  const href = (verParam: string | null) => {
    const params = new URLSearchParams();
    if (busqueda) params.set("q", busqueda);
    if (verParam) params.set("ver", verParam);
    const cadena = params.toString();
    return cadena ? `/estimaciones/pm-cobrado?${cadena}` : "/estimaciones/pm-cobrado";
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">PM contra cobrado</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lo que Planeación declaró en cada PM contra lo que ya se capturó en recibos vigentes. Cada
          área tiene su propio saldo; los reprocesos se pagan aparte y no cuentan. Electrificación
          se mide contra los muebles con iluminación.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form className="flex w-full max-w-md gap-2" action="/estimaciones/pm-cobrado">
          <input
            type="search"
            name="q"
            defaultValue={busqueda}
            placeholder="Buscar PM, O.T. o proyecto"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          />
          {soloDiferencias && <input type="hidden" name="ver" value="diferencias" />}
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Buscar
          </button>
        </form>
        <div className="flex gap-2 text-sm">
          <Link
            href={href(null)}
            className={`rounded border px-3 py-1 font-medium transition-colors pointer-coarse:py-2 ${
              !soloDiferencias
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Todos ({todos.length})
          </Link>
          <Link
            href={href("diferencias")}
            className={`rounded border px-3 py-1 font-medium transition-colors pointer-coarse:py-2 ${
              soloDiferencias
                ? "border-rose-600 bg-rose-600 text-white"
                : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            Con diferencias ({totalConDiferencias})
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          No se pudo cargar: {error}
        </p>
      )}

      {!error && visibles.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {todos.length === 0
            ? "Todavía no hay PM cargados."
            : soloDiferencias
              ? "Ningún PM tiene diferencias con lo cobrado."
              : `Ningún PM coincide con «${busqueda}».`}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {visibles.map((r) => (
          <Link
            key={r.pedidoId}
            href={`/estimaciones/pm-cobrado/${r.pedidoId}`}
            className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <span className="font-mono text-base font-semibold text-slate-900 group-hover:text-indigo-600">
                  {r.numeroPedido}
                </span>
                {r.proyecto && <span className="ml-2 text-sm text-slate-500">{r.proyecto}</span>}
              </div>
              <span className="text-xs text-slate-500">
                {r.modelos} modelos · {r.piezasPm} piezas en el PM
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {AREAS_COBRO.map((a) => (
                <BarraAvance key={a} etiqueta={AREA_RECIBO_LABELS[a]} avance={r.avance[a]} />
              ))}
            </div>
            {conDiferencias(r) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {r.excedidos > 0 && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700 ring-1 ring-rose-200">
                    {r.excedidos} {r.excedidos === 1 ? "modelo cobrado" : "modelos cobrados"} de más
                  </span>
                )}
                {r.fueraDelPm > 0 && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700 ring-1 ring-rose-200">
                    {r.fueraDelPm} {r.fueraDelPm === 1 ? "modelo" : "modelos"} fuera del PM
                  </span>
                )}
                {r.discrepanciasPendientes > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200">
                    {r.discrepanciasPendientes}{" "}
                    {r.discrepanciasPendientes === 1 ? "discrepancia" : "discrepancias"} sin decidir
                  </span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
