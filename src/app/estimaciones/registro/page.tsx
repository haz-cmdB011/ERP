import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual } from "@/lib/auth/get-perfil";
import { ESTADO_NOMBRE } from "@/lib/estimaciones/recibos-db";
import { ESTADOS_FILTRO, listarTodosLosRecibos } from "@/lib/estimaciones/listado-recibos";
import { NOMBRE_TIPO_CUALQUIERA, type TipoCualquierRecibo } from "@/lib/estimaciones/revision-db";
import {
  COOKIE_FILTRO_REGISTRO,
  contratistasDe,
  filtrarRecibos,
  hrefRegistro,
  leerFiltroRegistroGuardado,
  leerFiltros,
  ordenarParaRevision,
  paginar,
  type ParametrosRegistro,
} from "@/lib/estimaciones/filtros-registro";
import EstadoVacio from "@/components/estado-vacio";
import TablaRegistro from "./tabla-registro";
import FiltroRegistroRecordado from "./filtro-registro-recordado";

const TIPOS: TipoCualquierRecibo[] = ["acabados", "armado", "electrificacion"];

// Registro de recibos: todos los recibos guardados (Acabados, Armado y
// Electrificación), ordenados por folio de menor a mayor (numéricos
// primero, en orden; los que llevan letras o guiones van después). Se
// busca por folio, contratista, OT u obra y se filtra por estado, tipo y
// contratista (?estado=pendiente es la bandeja "Por revisar", con lo urgente y
// lo más antiguo primero). RLS ya filtra por is_estimaciones(), así que quien
// no tiene acceso al área simplemente ve la lista vacía; el maquilador tiene su
// propia vista.
export default async function RegistroRecibosPage({
  searchParams,
}: {
  searchParams: Promise<ParametrosRegistro>;
}) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (esMaquilador(perfil)) {
    redirect("/estimaciones/mis-recibos");
  }
  // Solo el desarrollador elimina recibos definitivamente (la base también lo exige).
  const esDesarrollador = perfil?.rol === "desarrollador";

  const filtros = leerFiltros(await searchParams);
  const guardado = leerFiltroRegistroGuardado((await cookies()).get(COOKIE_FILTRO_REGISTRO)?.value);

  const todos = await listarTodosLosRecibos(supabase);
  const conteo = Object.fromEntries(
    ESTADOS_FILTRO.map((e) => [e, todos.filter((r) => r.estado === e).length])
  );
  const contratistas = contratistasDe(todos);

  const coincidencias = filtrarRecibos(todos, filtros);
  const ordenadas = filtros.estado === "pendiente" ? ordenarParaRevision(coincidencias) : coincidencias;
  const pagina = paginar(ordenadas, filtros.pagina);
  const hayFiltros = !!(filtros.q || filtros.tipo || filtros.contratista);
  // Conserva lo demás al cambiar de estado.
  const conEstado = (estado: typeof filtros.estado) =>
    hrefRegistro({ ...filtros, estado, pagina: 1 });

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {filtros.estado === "pendiente" ? "Por revisar" : "Registro de recibos"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {filtros.estado === "pendiente"
              ? "Lo urgente y lo que más espera, primero. Al maquilador no se le paga hasta que el recibo queda revisado."
              : "Recibos de maquila (Acabados, Armado y Electrificación), ordenados por folio."}
          </p>
        </div>
        {pagina.total > 0 && (
          <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {pagina.total} recibo{pagina.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <form method="get" action="/estimaciones/registro" className="flex flex-wrap items-end gap-3">
        {filtros.estado && <input type="hidden" name="estado" value={filtros.estado} />}
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Buscar
          <input
            type="search"
            name="q"
            defaultValue={filtros.q}
            placeholder="Folio, contratista, OT u obra"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Tipo
          <select
            name="tipo"
            defaultValue={filtros.tipo ?? ""}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
          >
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TIPO_CUALQUIERA[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Contratista
          <select
            name="contratista"
            defaultValue={filtros.contratista}
            className="max-w-[16rem] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
          >
            <option value="">Todos</option>
            {contratistas.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-400"
        >
          Filtrar
        </button>
        {hayFiltros && (
          <Link
            href={hrefRegistro({ estado: filtros.estado })}
            className="py-2 text-sm text-slate-500 hover:text-slate-900 hover:underline"
          >
            Limpiar
          </Link>
        )}
      </form>

      <FiltroRegistroRecordado
        actual={{ tipo: filtros.tipo ?? undefined, contratista: filtros.contratista || undefined }}
        guardado={guardado}
        href={hrefRegistro({ estado: filtros.estado, tipo: guardado?.tipo, contratista: guardado?.contratista })}
      />

      <nav className="flex flex-wrap gap-2 text-sm">
        <Filtro href={conEstado(null)} activo={!filtros.estado} etiqueta="Vigentes" />
        {ESTADOS_FILTRO.map((e) => (
          <Filtro
            key={e}
            href={conEstado(e)}
            activo={filtros.estado === e}
            etiqueta={`${ESTADO_NOMBRE[e]} (${conteo[e]})`}
          />
        ))}
      </nav>

      {pagina.total === 0 ? (
        <EstadoVacio
          titulo={
            hayFiltros
              ? "Ningún recibo coincide con tu búsqueda"
              : filtros.estado === "pendiente"
                ? "No hay recibos por revisar"
                : "No hay recibos en esta vista"
          }
          descripcion={hayFiltros ? "Prueba con otro folio, contratista u OT, o quita los filtros." : undefined}
          accion={hayFiltros ? { href: hrefRegistro({ estado: filtros.estado }), etiqueta: "Quitar filtros" } : undefined}
        />
      ) : (
        <TablaRegistro recibos={pagina.items} esDesarrollador={esDesarrollador} />
      )}

      {pagina.totalPaginas > 1 && (
        <nav aria-label="Páginas" className="flex flex-wrap items-center justify-center gap-3 text-sm">
          {pagina.pagina > 1 ? (
            <Link
              href={hrefRegistro({ ...filtros, pagina: pagina.pagina - 1 })}
              className="rounded px-3 py-1 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              ← Anterior
            </Link>
          ) : (
            <span className="rounded px-3 py-1 text-slate-300 ring-1 ring-slate-100">← Anterior</span>
          )}
          <span className="text-slate-500">
            Página {pagina.pagina} de {pagina.totalPaginas}
          </span>
          {pagina.pagina < pagina.totalPaginas ? (
            <Link
              href={hrefRegistro({ ...filtros, pagina: pagina.pagina + 1 })}
              className="rounded px-3 py-1 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Siguiente →
            </Link>
          ) : (
            <span className="rounded px-3 py-1 text-slate-300 ring-1 ring-slate-100">Siguiente →</span>
          )}
        </nav>
      )}
    </main>
  );
}

function Filtro({ href, activo, etiqueta }: { href: string; activo: boolean; etiqueta: string }) {
  return (
    <Link
      href={href}
      className={`rounded px-3 py-1 font-medium ring-1 ${
        activo
          ? "bg-brand-500 text-on-brand ring-brand-600"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {etiqueta}
    </Link>
  );
}
