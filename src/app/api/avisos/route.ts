import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DIAS_DE_AVISOS, MAX_AVISOS, esAreaAviso, type Aviso } from "@/lib/notificaciones/avisos";
import { despacharAvisos } from "@/lib/notificaciones/despachar";

export const runtime = "nodejs";

interface FilaAviso {
  id: string;
  area: Aviso["area"];
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string | null;
  creado_en: string;
}

// Los avisos de un área para la campanita (los últimos 30 días, hasta 30) y cuáles ya leyó esta persona.
// La base decide qué puede ver cada quien (RLS): el personal del área y el desarrollador ven los del área; el
// maquilador, solo los suyos. Si la tabla todavía no existe responde "no disponible" y la campanita se esconde.
//
// De paso reparte al celular los avisos que esta persona acaba de provocar (ver despachar.ts): la campanita
// pregunta cada minuto, así que también salen los que nacen de funciones que la app llama directo.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const area = new URL(request.url).searchParams.get("area");
  if (!esAreaAviso(area)) return NextResponse.json({ error: "Área no válida." }, { status: 400 });

  after(() => despacharAvisos(user.id));

  const desde = new Date(Date.now() - DIAS_DE_AVISOS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("avisos")
    .select("id, area, tipo, titulo, cuerpo, url, creado_en")
    .eq("area", area)
    .gte("creado_en", desde)
    .order("creado_en", { ascending: false })
    .limit(MAX_AVISOS)
    .returns<FilaAviso[]>();
  if (error) {
    console.error("avisos: no se pudieron leer", error.message);
    return NextResponse.json({ disponible: false, avisos: [], noLeidos: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  const filas = data ?? [];
  const leidos = new Set<string>();
  if (filas.length > 0) {
    const { data: marcas, error: errorMarcas } = await supabase
      .from("avisos_leidos")
      .select("aviso_id")
      .in(
        "aviso_id",
        filas.map((f) => f.id)
      )
      .returns<{ aviso_id: string }[]>();
    if (errorMarcas) console.error("avisos: no se pudieron leer los leídos", errorMarcas.message);
    for (const m of marcas ?? []) leidos.add(m.aviso_id);
  }

  const avisos: Aviso[] = filas.map((f) => ({
    id: f.id,
    area: f.area,
    tipo: f.tipo,
    titulo: f.titulo,
    cuerpo: f.cuerpo,
    url: f.url,
    creadoEn: f.creado_en,
    leido: leidos.has(f.id),
  }));
  return NextResponse.json(
    { disponible: true, avisos, noLeidos: avisos.filter((a) => !a.leido).length },
    { headers: { "Cache-Control": "no-store" } }
  );
}
