import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEvaluarCalidad } from "@/lib/auth/get-perfil";
import { paginarTodo } from "@/lib/supabase/paginar";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { generarExcelIncidencias } from "@/lib/calidad/incidencias-excel";
import {
  COLUMNAS_INCIDENCIAS,
  filtrarIncidencias,
  leerFiltrosIncidencias,
  leerRef,
  leerVista,
  listaFiltros,
  periodoDe,
  refPorDefecto,
  type Incidencia,
  type ParametrosIncidencias,
} from "@/lib/calidad/incidencias";
import { NOMBRE_VISTA, etiquetaPeriodo } from "@/app/calidad/incidencias/formato";

export const runtime = "nodejs";

// Descarga en Excel el tablero de No conformidades del periodo (día, semana, mes o año) y con los
// filtros que se estén viendo en /calidad/incidencias: el resumen, una hoja por gráfica, los
// pendientes de más de 30 días y la lista completa de reportes con su texto. Solo Calidad
// (la RLS de la tabla también lo exige).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!puedeEvaluarCalidad(perfil)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const parametros = Object.fromEntries(request.nextUrl.searchParams) as ParametrosIncidencias;
  const filtros = leerFiltrosIncidencias(parametros);
  const vista = leerVista(parametros.vista);

  let todas: Incidencia[];
  try {
    todas = await paginarTodo<Incidencia>(
      (desde, hasta) =>
        supabase
          .from("incidencias_calidad")
          .select(COLUMNAS_INCIDENCIAS)
          .order("linea", { ascending: true })
          .order("id", { ascending: true })
          .range(desde, hasta)
          .returns<Incidencia[]>(),
      { contexto: "las no conformidades" }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudieron leer las no conformidades" },
      { status: 500 }
    );
  }

  const hoy = hoyMexico();
  const dia = leerRef(parametros.ref) ?? refPorDefecto(todas, hoy, vista);
  const periodo = periodoDe(vista, dia);
  const excel = await generarExcelIncidencias({
    filas: filtrarIncidencias(todas, filtros),
    periodo,
    etiquetaPeriodo: etiquetaPeriodo(periodo),
    filtros: listaFiltros(filtros),
    hoy,
  });

  const nombre = nombreArchivoSeguro(
    `No conformidades ${NOMBRE_VISTA[vista]} ${periodo.inicio}${periodo.fin === periodo.inicio ? "" : ` a ${periodo.fin}`}.xlsx`
  );
  // Los encabezados HTTP solo admiten ASCII: el nombre con acentos va en filename*.
  const nombreAscii = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "-");

  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreAscii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
