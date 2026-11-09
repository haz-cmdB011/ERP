import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/get-perfil";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { generarExcelControl, generarExcelHistorial } from "@/lib/produccion/bitacora-excel";
import {
  filtrarControl,
  filtrarHistorial,
  leerFiltroCambio,
  leerFiltroMarca,
} from "@/lib/produccion/control-taller";
import { cargarControl, cargarEventos } from "@/lib/produccion/control-taller-db";

export const runtime = "nodejs";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Descarga en Excel la lista de control (`vista=control`) o el historial (`vista=historial`) de la
// bitácora de taller con los mismos filtros de la pantalla /produccion/bitacora. La RLS deja fuera
// a los maquiladores.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (perfil.rol === "maquilador") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const p = request.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 100);
  const hoy = hoyMexico();
  const tipo = p.get("vista") === "historial" ? "historial" : "control";

  let excel: Buffer;
  if (tipo === "historial") {
    const { eventos, error } = await cargarEventos(supabase);
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
    const desde = p.get("desde");
    const hasta = p.get("hasta");
    excel = await generarExcelHistorial(
      filtrarHistorial(eventos, {
        cambio: leerFiltroCambio(p.get("cambio") ?? undefined),
        q,
        desde: desde && FECHA.test(desde) ? desde : null,
        hasta: hasta && FECHA.test(hasta) ? hasta : null,
      })
    );
  } else {
    const renglones = await cargarControl(supabase);
    excel = await generarExcelControl(filtrarControl(renglones, { marca: leerFiltroMarca(p.get("marca") ?? undefined), q }));
  }

  const nombre = `BITACORA TALLER ${tipo.toUpperCase()} ${hoy}.xlsx`;
  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
