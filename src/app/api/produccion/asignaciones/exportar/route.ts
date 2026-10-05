import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/get-perfil";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { consultarAsignaciones, leerFiltros } from "@/lib/produccion/consultar-asignaciones";
import { generarExcelAsignaciones } from "@/lib/produccion/asignaciones-excel";

export const runtime = "nodejs";

// Descarga en Excel las asignaciones con los mismos filtros de la pantalla
// /produccion/asignaciones. La RLS deja fuera a los maquiladores.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (perfil.rol === "maquilador") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const filtros = leerFiltros(Object.fromEntries(request.nextUrl.searchParams));
  const { filas, error } = await consultarAsignaciones(supabase, filtros);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const hoy = hoyMexico();
  const excel = await generarExcelAsignaciones(filas, hoy);
  const nombre = `ASIGNACIONES PRODUCCION ${hoy}.xlsx`;

  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
