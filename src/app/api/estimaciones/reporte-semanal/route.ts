import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { cargarOtContraCobrado, tieneDiferencias } from "@/lib/estimaciones/pm-cobrado";
import { ETIQUETA_AREA } from "@/lib/estimaciones/reporte-dashboard";
import {
  describirFiltrosReporte,
  filtrarPagados,
  hayFiltrosReporte,
  leerFiltrosReporte,
} from "@/lib/estimaciones/reporte-control";
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

  // Mismos filtros que la pantalla (area, maquilador, ot).
  const filtros = leerFiltrosReporte({
    area: params.get("area") ?? undefined,
    maquilador: params.get("maquilador") ?? undefined,
    ot: params.get("ot") ?? undefined,
  });
  const filtrados = filtrarPagados(recibos, filtros);

  // Hoja de diferencias contra el PM, solo de las O.T. que salen en el reporte.
  const pm = await cargarOtContraCobrado(supabase);
  if (pm.error) {
    return NextResponse.json({ error: `No se pudo leer el PM contra cobrado: ${pm.error}` }, { status: 500 });
  }
  const ots = new Set(filtrados.map((r) => r.ot.trim()).filter(Boolean));
  const diferenciasPm = pm.filas.filter((f) => ots.has(f.ot) && tieneDiferencias(f));

  const hoy = fechaLocal(new Date());
  const [a, m, d] = hoy.split("-");
  const filtrado = hayFiltrosReporte(filtros);
  const excel = await generarExcelFormato(armarReporte(filtrados), semana, `${d}/${m}/${a}`, {
    filtro: filtrado ? describirFiltrosReporte(filtros, ETIQUETA_AREA) : undefined,
    diferenciasPm,
  });
  const nombre = nombreArchivoFormato(semana, hoy, filtrado);

  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
