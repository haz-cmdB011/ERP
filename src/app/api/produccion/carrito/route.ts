import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { cargarDatosCarrito } from "@/lib/produccion/carrito-db";
import { MAX_ITEMS_CARRITO } from "@/lib/produccion/carrito";
import type { EncargadoEquipo, EquipoProduccion } from "@/lib/produccion/asignaciones";

export const runtime = "nodejs";

// Estado actual de los ítems del carrito (el carrito vive en el aparato; aquí se
// consulta qué tan liberados están y qué falta por asignar) más los equipos para
// asignarlos. Solo lectura.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let itemIds: unknown;
  try {
    itemIds = (await request.json())?.itemIds;
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }
  if (
    !Array.isArray(itemIds) ||
    itemIds.length > MAX_ITEMS_CARRITO ||
    !itemIds.every((id) => typeof id === "string")
  ) {
    return NextResponse.json({ error: "Se requiere itemIds: un arreglo de IDs de ítems." }, { status: 400 });
  }

  try {
    const perfil = await getPerfilActual(supabase);
    const [datos, equipos, encargados] = await Promise.all([
      cargarDatosCarrito(supabase, itemIds),
      supabase
        .from("equipos_produccion")
        .select("id, nombre, encargado, es_planta, procesos, activo")
        .eq("activo", true)
        .order("es_planta", { ascending: false })
        .order("nombre")
        .returns<EquipoProduccion[]>(),
      supabase
        .from("encargados_equipo_produccion")
        .select("equipo_id, nombre")
        .order("nombre")
        .returns<EncargadoEquipo[]>(),
    ]);
    if (equipos.error || encargados.error) {
      throw new Error((equipos.error ?? encargados.error)?.message);
    }
    return NextResponse.json({
      ...datos,
      puedeEditar: puedeEditarProduccion(perfil),
      equipos: equipos.data ?? [],
      encargados: encargados.data ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: `No se pudo leer el carrito: ${e instanceof Error ? e.message : "error desconocido"}` },
      { status: 500 }
    );
  }
}
