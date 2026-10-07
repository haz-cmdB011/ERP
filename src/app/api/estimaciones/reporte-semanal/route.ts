import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import {
  armarReporte,
  cargarRecibosPagados,
  fechaLocal,
  semanasDelAnio,
} from "@/lib/estimaciones/reporte-semanal";
import {
  generarExcelFormato,
  nombreArchivoFormato,
} from "@/lib/estimaciones/reporte-semanal-excel";

// Descarga el reporte semanal como "FORMATO MAQUILA" (?anio=2026&semana=38).
// Solo el personal de Estimaciones; la RLS de recibos vuelve a filtrar.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!puedeVerPrecioSugerido(perfil)) {
    return NextResponse.json({ error: "Sin acceso al reporte" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const anio = Number(params.get("anio"));
  const numSemana = Number(params.get("semana"));
  if (
    !Number.isInteger(anio) ||
    anio < 2000 ||
    anio > 2100 ||
    !Number.isInteger(numSemana) ||
    numSemana < 1 ||
    numSemana > semanasDelAnio(anio)
  ) {
    return NextResponse.json({ error: "Semana no válida" }, { status: 400 });
  }
  const semana = { anio, semana: numSemana };

  // Sin lectura completa no se entrega el Excel: llevaría totales parciales.
  let recibos;
  try {
    recibos = await cargarRecibosPagados(supabase, semana);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo leer el reporte";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }

  const [a, m, d] = fechaLocal(new Date()).split("-");
  const excel = await generarExcelFormato(armarReporte(recibos), semana, `${d}/${m}/${a}`);
  const nombre = nombreArchivoFormato(semana);

  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
