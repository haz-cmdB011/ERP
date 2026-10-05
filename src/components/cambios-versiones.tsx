import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CAMPOS_NUMERICOS,
  ETIQUETA_CAMPO,
  compararVersiones,
  type CambioCampo,
  type CambioComponente,
  type CambioMueble,
  type ItemComparable,
  type ResumenCambios,
} from "@/lib/planeacion/diff-versiones";
import { cargarItemsVersion } from "@/lib/planeacion/versiones-db";
import { CLASE_MIGA, FlechaRegresar } from "@/components/regresar-estilo";

// Qué cambió entre dos versiones de un PM. Se monta en Planeación y en
// Producción (/<área>/pedidos/[id]/cambios?de=2&a=3&ver=...).

interface VersionRow {
  id: string;
  numero_version: number;
  es_version_activa: boolean;
  created_at: string;
  cargas_archivo: { nombre_archivo: string } | null;
}

const FILTROS = {
  todos: "Todo",
  cambios: "Con cambios",
  nuevos: "Nuevos",
  quitados: "Quitados",
} as const;
type Filtro = keyof typeof FILTROS;

const TIPO_POR_FILTRO: Record<Exclude<Filtro, "todos">, CambioMueble["tipo"]> = {
  cambios: "modificado",
  nuevos: "agregado",
  quitados: "quitado",
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function numero(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

function valor(v: string | number | null): string {
  if (v === null || v === "") return "—";
  return typeof v === "number" ? numero(v) : v;
}

// "+2" / "−3" para los campos numéricos.
function diferencia(c: CambioCampo): string | null {
  if (!CAMPOS_NUMERICOS.has(c.campo) || typeof c.antes !== "number" || typeof c.despues !== "number") {
    return null;
  }
  const d = c.despues - c.antes;
  return `${d > 0 ? "+" : "−"}${numero(Math.abs(d))}`;
}

function primeraLinea(texto: string | null): string {
  return texto?.split("\n")[0] ?? "";
}

export default async function CambiosVersiones({
  pedidoId,
  area,
  de,
  a,
  ver,
}: {
  pedidoId: string;
  area: "planeacion" | "produccion";
  de?: string;
  a?: string;
  ver?: string;
}) {
  const supabase = await createClient();
  const basePedido = `/${area}/pedidos/${pedidoId}`;

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, numero_pedido, proyectos ( nombre, cliente )")
    .eq("id", pedidoId)
    .maybeSingle<{
      id: string;
      numero_pedido: string;
      proyectos: { nombre: string; cliente: string } | null;
    }>();
  if (!pedido) notFound();

  const { data: versiones } = await supabase
    .from("pedido_versiones")
    .select("id, numero_version, es_version_activa, created_at, cargas_archivo:carga_id ( nombre_archivo )")
    .eq("pedido_id", pedidoId)
    .order("numero_version", { ascending: false })
    .returns<VersionRow[]>();
  const lista = versiones ?? [];

  // Por omisión: la versión activa contra la anterior a ella.
  const porNumero = (n?: string) => (n ? lista.find((v) => String(v.numero_version) === n) : undefined);
  let versionA = porNumero(a) ?? lista.find((v) => v.es_version_activa) ?? lista[0];
  let versionDe =
    porNumero(de) ?? (versionA ? lista.find((v) => v.numero_version < versionA!.numero_version) : undefined);
  // Si se eligió la primera versión, se compara contra la siguiente.
  if (versionA && !versionDe) {
    const siguiente = [...lista].reverse().find((v) => v.numero_version > versionA!.numero_version);
    if (siguiente) {
      versionDe = versionA;
      versionA = siguiente;
    }
  }

  const filtro: Filtro = ver && ver in FILTROS ? (ver as Filtro) : "todos";
  // Enlace a esta misma comparación con otro filtro.
  const hrefFiltro = (f: Filtro) => {
    const qs = new URLSearchParams();
    if (versionDe) qs.set("de", String(versionDe.numero_version));
    if (versionA) qs.set("a", String(versionA.numero_version));
    if (f !== "todos") qs.set("ver", f);
    return `${basePedido}/cambios?${qs.toString()}`;
  };

  const encabezado = (
    <div className="border-b border-slate-200 pb-4">
      <Link
        href={basePedido}
        className={CLASE_MIGA}
      >
        <FlechaRegresar className="h-4 w-4" />
        {pedido.numero_pedido}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
        Cambios entre versiones
      </h1>
      {pedido.proyectos && (
        <p className="text-sm text-slate-600">
          {pedido.proyectos.nombre} — {pedido.proyectos.cliente}
        </p>
      )}
    </div>
  );

  if (!versionA || !versionDe) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
        {encabezado}
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Este PM tiene una sola versión: todavía no hay con qué comparar. Cuando se suba una
          actualización del Excel, aquí se verá qué cambió.
        </p>
      </main>
    );
  }

  const [itemsDe, itemsA] =
    versionDe.id === versionA.id
      ? [null, null]
      : await Promise.all([
          cargarItemsVersion(supabase, versionDe.id),
          cargarItemsVersion(supabase, versionA.id),
        ]);
  const comparacion = itemsDe && itemsA ? compararVersiones(itemsDe, itemsA) : null;
  const visibles = comparacion
    ? filtro === "todos"
      ? comparacion.cambios
      : comparacion.cambios.filter((c) => c.tipo === TIPO_POR_FILTRO[filtro])
    : [];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      {encabezado}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <SelectorVersion nombre="de" etiqueta="Versión anterior" versiones={lista} valor={versionDe.numero_version} />
        <span className="pb-2 text-slate-400" aria-hidden>
          →
        </span>
        <SelectorVersion nombre="a" etiqueta="Versión nueva" versiones={lista} valor={versionA.numero_version} />
        {filtro !== "todos" && <input type="hidden" name="ver" value={filtro} />}
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Comparar
        </button>
      </form>

      <dl className="grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
        {[versionDe, versionA].map((v) => (
          <div key={v.id} className="flex gap-2">
            <dt className="font-semibold text-slate-700">v{v.numero_version}</dt>
            <dd className="truncate" title={v.cargas_archivo?.nombre_archivo}>
              {fecha(v.created_at)}
              {v.cargas_archivo ? ` · ${v.cargas_archivo.nombre_archivo}` : ""}
            </dd>
          </div>
        ))}
      </dl>

      {versionDe.id === versionA.id && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Elige dos versiones distintas para compararlas.
        </p>
      )}

      {versionDe.id !== versionA.id && !comparacion && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los ítems de las versiones. Intenta de nuevo.
        </p>
      )}

      {comparacion && (
        <>
          <Resumen resumen={comparacion.resumen} />

          {comparacion.cambios.length > 0 && (
            <nav className="flex flex-wrap gap-2" aria-label="Filtrar cambios">
              {(Object.keys(FILTROS) as Filtro[]).map((f) => {
                const cuenta =
                  f === "todos"
                    ? comparacion.cambios.length
                    : comparacion.cambios.filter((c) => c.tipo === TIPO_POR_FILTRO[f]).length;
                const activo = f === filtro;
                return (
                  <Link
                    key={f}
                    href={hrefFiltro(f)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      activo
                        ? "border-brand-600 bg-brand-500 text-on-brand"
                        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {FILTROS[f]} ({cuenta})
                  </Link>
                );
              })}
            </nav>
          )}

          {comparacion.cambios.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No hay diferencias entre v{versionDe.numero_version} y v{versionA.numero_version}.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {visibles.map((c) => (
                <TarjetaMueble key={(c.despues ?? c.antes)!.id} cambio={c} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function SelectorVersion({
  nombre,
  etiqueta,
  versiones,
  valor,
}: {
  nombre: string;
  etiqueta: string;
  versiones: VersionRow[];
  valor: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {etiqueta}
      <select
        name={nombre}
        defaultValue={valor}
        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal normal-case tracking-normal text-slate-800 shadow-sm focus:border-brand-600 focus:outline-none"
      >
        {versiones.map((v) => (
          <option key={v.id} value={v.numero_version}>
            v{v.numero_version}
            {v.es_version_activa ? " (activa)" : ""} · {fecha(v.created_at)}
          </option>
        ))}
      </select>
    </label>
  );
}

// "1 nuevo" / "3 nuevos".
function cuenta(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function Resumen({ resumen }: { resumen: ResumenCambios }) {
  const chips = [
    { texto: cuenta(resumen.mueblesAgregados, "nuevo", "nuevos"), clase: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
    { texto: cuenta(resumen.mueblesQuitados, "quitado", "quitados"), clase: "bg-rose-50 text-rose-800 ring-rose-200" },
    { texto: `${resumen.mueblesModificados} con cambios`, clase: "bg-amber-50 text-amber-800 ring-amber-200" },
    { texto: `${resumen.mueblesSinCambios} sin cambios`, clase: "bg-slate-100 text-slate-600 ring-slate-200" },
  ];
  const componentes = [
    resumen.componentesAgregados > 0 && cuenta(resumen.componentesAgregados, "nuevo", "nuevos"),
    resumen.componentesQuitados > 0 && cuenta(resumen.componentesQuitados, "quitado", "quitados"),
    resumen.componentesModificados > 0 && `${resumen.componentesModificados} con cambios`,
  ].filter(Boolean);

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Muebles</span>
        {chips.map((c) => (
          <span key={c.texto} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${c.clase}`}>
            {c.texto}
          </span>
        ))}
      </div>
      {componentes.length > 0 && (
        <p className="text-xs text-slate-600">
          <span className="font-semibold uppercase tracking-wide text-slate-500">Componentes</span>{" "}
          {componentes.join(" · ")} (dentro de muebles que siguen en el PM).
        </p>
      )}
      {resumen.renumerados > 0 && (
        <p className="text-xs text-slate-500">
          {resumen.renumerados} mueble{resumen.renumerados === 1 ? "" : "s"} cambi
          {resumen.renumerados === 1 ? "ó" : "aron"} de número de ítem (por otros insertados o
          quitados antes); eso solo no cuenta como cambio.
        </p>
      )}
    </section>
  );
}

const ESTILO_TIPO: Record<CambioMueble["tipo"], { texto: string; clase: string; borde: string }> = {
  agregado: { texto: "Nuevo", clase: "bg-emerald-50 text-emerald-800 ring-emerald-200", borde: "border-l-emerald-400" },
  quitado: { texto: "Quitado", clase: "bg-rose-50 text-rose-800 ring-rose-200", borde: "border-l-rose-400" },
  modificado: { texto: "Cambios", clase: "bg-amber-50 text-amber-800 ring-amber-200", borde: "border-l-amber-400" },
};

function TarjetaMueble({ cambio }: { cambio: CambioMueble }) {
  const item = (cambio.despues ?? cambio.antes)!;
  const estilo = ESTILO_TIPO[cambio.tipo];
  const tachado = cambio.tipo === "quitado" ? "line-through decoration-rose-400" : "";
  return (
    <article
      className={`overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white shadow-sm ${estilo.borde}`}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${estilo.clase}`}>
          {estilo.texto}
        </span>
        <span className={`font-mono text-sm font-semibold text-slate-900 ${tachado}`}>
          Ítem {numero(item.itemCode)}
        </span>
        {cambio.renumerado && cambio.antes && (
          <span className="text-xs text-slate-500">(antes {numero(cambio.antes.itemCode)})</span>
        )}
        {item.modelo && <span className={`font-mono text-sm text-slate-800 ${tachado}`}>{item.modelo}</span>}
        <span className={`min-w-0 flex-1 truncate text-sm text-slate-600 ${tachado}`} title={item.descripcion ?? ""}>
          {primeraLinea(item.descripcion)}
        </span>
        <span className="whitespace-nowrap text-xs tabular-nums text-slate-500">
          {numero(item.cantidadTotal)} {item.unidad ?? ""}
        </span>
      </header>

      {(cambio.campos.length > 0 || cambio.componentes.length > 0) && (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3">
          {cambio.campos.length > 0 && <TablaCampos campos={cambio.campos} />}
          {cambio.componentes.length > 0 &&
            (cambio.tipo === "modificado" ? (
              <ListaComponentes componentes={cambio.componentes} />
            ) : (
              <details open={cambio.tipo === "agregado"}>
                <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-brand-700">
                  {cambio.componentes.length} componente{cambio.componentes.length === 1 ? "" : "s"}
                  {cambio.tipo === "agregado" ? " incluidos" : " que se quitan con él"}
                </summary>
                <div className="mt-2">
                  <ListaComponentes componentes={cambio.componentes} />
                </div>
              </details>
            ))}
        </div>
      )}
    </article>
  );
}

function TablaCampos({ campos }: { campos: CambioCampo[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="w-40 py-1 pr-3">Campo</th>
            <th className="py-1 pr-3">Antes</th>
            <th className="py-1">Ahora</th>
          </tr>
        </thead>
        <tbody className="align-top">
          {campos.map((c) => {
            const dif = diferencia(c);
            return (
              <tr key={c.campo} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 text-xs font-medium text-slate-600">{ETIQUETA_CAMPO[c.campo]}</td>
                <td className="py-1.5 pr-3">
                  <span className="whitespace-pre-wrap rounded bg-rose-50 px-1.5 py-0.5 text-rose-800">
                    {valor(c.antes)}
                  </span>
                </td>
                <td className="py-1.5">
                  <span className="whitespace-pre-wrap rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                    {valor(c.despues)}
                  </span>
                  {dif && <span className="ml-2 text-xs font-semibold tabular-nums text-slate-500">{dif}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const SIMBOLO_COMPONENTE: Record<CambioComponente["tipo"], { simbolo: string; clase: string }> = {
  agregado: { simbolo: "+", clase: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  quitado: { simbolo: "−", clase: "bg-rose-50 text-rose-700 ring-rose-200" },
  modificado: { simbolo: "~", clase: "bg-amber-50 text-amber-700 ring-amber-200" },
};

function ListaComponentes({ componentes }: { componentes: CambioComponente[] }) {
  return (
    <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-100">
      {componentes.map((c) => {
        const item: ItemComparable = (c.despues ?? c.antes)!;
        const s = SIMBOLO_COMPONENTE[c.tipo];
        return (
          <li
            key={item.id}
            className={`flex items-start gap-2 px-3 py-2 text-sm ${c.derivado ? "text-slate-500" : ""}`}
          >
            <span
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ring-1 ${s.clase}`}
              aria-label={c.tipo}
            >
              {s.simbolo}
            </span>
            <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-slate-500">
              {numero(item.itemCode)}
            </span>
            <div className="min-w-0 flex-1">
              <p>
                {item.tipoMaterial && (
                  <span className="mr-1.5 text-[11px] font-semibold uppercase text-slate-500">
                    {item.tipoMaterial}
                  </span>
                )}
                <span
                  className={
                    c.tipo === "quitado"
                      ? "line-through decoration-rose-400"
                      : c.derivado
                        ? ""
                        : "text-slate-800"
                  }
                >
                  {primeraLinea(item.descripcion) || "—"}
                </span>
              </p>
              {c.campos.length > 0 && (
                <div className="mt-0.5 flex flex-col gap-0.5 text-xs">
                  {c.campos.map((f) => (
                    <span key={f.campo}>
                      <span className="font-medium text-slate-600">{ETIQUETA_CAMPO[f.campo]}:</span>{" "}
                      <span className="text-rose-700 line-through decoration-rose-300">{valor(f.antes)}</span>{" "}
                      → <span className="text-emerald-700">{valor(f.despues)}</span>
                      {diferencia(f) && <span className="ml-1 font-semibold text-slate-500">({diferencia(f)})</span>}
                      {c.derivado && <span className="ml-1 italic">por la cantidad del mueble</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {c.tipo !== "modificado" && (
              <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs tabular-nums text-slate-500">
                {numero(item.cantidadTotal)} {item.unidad ?? ""}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
