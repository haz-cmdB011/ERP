import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/get-perfil";
import { leerFiltrosFolios } from "@/lib/calidad/folios-filtros";
import { cargarFoliosParaExcel, MAX_FOLIOS_EXCEL } from "@/lib/calidad/folios-consulta";
import { generarExcelFolios } from "@/lib/calidad/folios-excel";
import { hoyMexico } from "@/lib/produccion/asignaciones";

export const runtime = "nodejs";

// Descarga en Excel los folios de calidad con los mismos filtros de la pantalla
// /calidad/folios. La RLS deja fuera a quien no es personal (maquiladores).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (perfil.rol === "maquilador") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const filtros = leerFiltrosFolios(Object.fromEntries(request.nextUrl.searchParams));
  let resultado;
  try {
    resultado = await cargarFoliosParaExcel(supabase, filtros);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudieron leer los folios" },
      { status: 500 }
    );
  }

  const excel = await generarExcelFolios(resultado.filas);
  const hoy = hoyMexico();
  const nombre = `FOLIOS DE CALIDAD ${hoy}.xlsx`;

  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
      // El archivo trae como máximo MAX_FOLIOS_EXCEL: se avisa si faltaron.
      ...(resultado.truncado ? { "X-Folios-Truncado": String(MAX_FOLIOS_EXCEL) } : {}),
    },
  });
}
