import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/get-perfil";
import {
  MIN_CARACTERES_BUSQUEDA,
  atajosCoincidentes,
  hrefModelo,
  hrefOrdenTrabajo,
  hrefPedido,
  hrefRecibo,
  normalizarBusqueda,
  terminoSeguro,
  type AreaBusqueda,
  type GrupoBusqueda,
  type ResultadoBusqueda,
} from "@/lib/busqueda/global";

// Por grupo: el buscador es para saltar rápido, no para listar todo (para eso
// están los paneles de cada área).
const LIMITE = 6;
const AREAS: AreaBusqueda[] = [
  "planeacion",
  "produccion",
  "calidad",
  "estimaciones",
  "usuarios",
];

interface PedidoRow {
  id: string;
  numero_pedido: string;
  orden_trabajo: string | null;
  proyectos: { nombre: string; cliente: string } | null;
}

interface ModeloRow {
  modelo: string;
  descripcion: string | null;
  pedido_versiones: { pedidos: { id: string; numero_pedido: string } };
}

interface ReciboRow {
  folio: string;
  ot: string | null;
  contratista: string;
  estado: string;
  tipo?: string;
}

const ESTADO_RECIBO: Record<string, string> = {
  pendiente: "por revisar",
  revisado: "revisado",
  pagado: "pagado",
  cancelado: "cancelado",
};

// Buscador global (Ctrl + K): O.T., PM (por número, proyecto o cliente),
// modelos de la versión activa, folios de Calidad y Producción y recibos de
// Estimaciones. Consulta con la sesión del usuario, así que cada quien solo
// encuentra lo que el RLS le deja ver (un maquilador, solo sus recibos).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const consulta = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const areaParam = request.nextUrl.searchParams.get("area");
  const area = AREAS.includes(areaParam as AreaBusqueda)
    ? (areaParam as AreaBusqueda)
    : null;
  const maquilador = perfil.rol === "maquilador";

  const grupos: GrupoBusqueda[] = [];
  const agregar = (titulo: string, resultados: ResultadoBusqueda[]) => {
    if (resultados.length) grupos.push({ titulo, resultados });
  };

  agregar(
    "Pantallas",
    atajosCoincidentes(consulta, {
      maquilador,
      esDesarrollador: perfil.rol === "desarrollador",
    }),
  );

  const termino = terminoSeguro(consulta);
  if (termino.length < MIN_CARACTERES_BUSQUEDA) {
    return NextResponse.json({ grupos });
  }
  const patron = `%${termino}%`;
  // Entre comillas dentro de .or() para que los espacios del texto no rompan
  // el filtro (terminoSeguro ya quitó comillas y diagonales).
  const patronOr = `"${patron}"`;

  const buscarRecibos = async (): Promise<ResultadoBusqueda[]> => {
    const [generales, electrificacion] = await Promise.all([
      supabase
        .from("recibos")
        .select("folio, ot, contratista, estado, tipo")
        .or(`folio.ilike.${patronOr},ot.ilike.${patronOr}`)
        .order("creado_en", { ascending: false })
        .limit(LIMITE)
        .returns<ReciboRow[]>(),
      supabase
        .from("recibos_electrificacion")
        .select("folio, ot, contratista, estado")
        .or(`folio.ilike.${patronOr},ot.ilike.${patronOr}`)
        .order("creado_en", { ascending: false })
        .limit(LIMITE)
        .returns<ReciboRow[]>(),
    ]);
    for (const r of [generales, electrificacion]) {
      if (r.error) console.error(`[buscar] recibos: ${r.error.message}`);
    }
    const filas = [
      ...(generales.data ?? []),
      ...(electrificacion.data ?? []).map((r) => ({
        ...r,
        tipo: "electrificacion",
      })),
    ];
    return filas.slice(0, LIMITE).map((r) => ({
      tipo: "recibo",
      titulo: `Recibo ${r.folio}`,
      detalle: [
        r.tipo === "electrificacion"
          ? "Electrificación"
          : r.tipo === "armado"
            ? "Armado"
            : "Acabados",
        r.ot ? `O.T. ${r.ot}` : null,
        maquilador ? null : r.contratista,
        ESTADO_RECIBO[r.estado] ?? r.estado,
      ]
        .filter(Boolean)
        .join(" · "),
      href: hrefRecibo(r.tipo ?? "acabados", r.folio),
    }));
  };

  // El maquilador (externo) no ve pedidos ni folios internos: solo sus recibos.
  if (maquilador) {
    agregar("Recibos", await buscarRecibos());
    return NextResponse.json({ grupos });
  }

  const selectPedido =
    "id, numero_pedido, orden_trabajo, proyectos ( nombre, cliente )";
  const [
    porNumero,
    proyectos,
    modelos,
    foliosCalidad,
    foliosProduccion,
    recibos,
  ] = await Promise.all([
    supabase
      .from("pedidos")
      .select(selectPedido)
      .or(`numero_pedido.ilike.${patronOr},orden_trabajo.ilike.${patronOr}`)
      .is("eliminado_en", null)
      .is("eliminado_definitivo_en", null)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<PedidoRow[]>(),
    supabase
      .from("proyectos")
      .select("id")
      .or(`nombre.ilike.${patronOr},cliente.ilike.${patronOr}`)
      .limit(20),
    supabase
      .from("planeacion_items")
      .select(
        "modelo, descripcion, pedido_versiones!inner ( es_version_activa, pedidos!inner ( id, numero_pedido, eliminado_en, eliminado_definitivo_en ) )",
      )
      .ilike("modelo", patron)
      .eq("pedido_versiones.es_version_activa", true)
      .is("pedido_versiones.pedidos.eliminado_en", null)
      .is("pedido_versiones.pedidos.eliminado_definitivo_en", null)
      .is("parent_item_id", null)
      .order("modelo")
      .limit(40)
      .returns<ModeloRow[]>(),
    supabase
      .from("informes_calidad_estado")
      .select("folio, aprobado")
      .ilike("folio", patron)
      .order("elaborado_en", { ascending: false })
      .limit(LIMITE),
    supabase
      .from("folios_produccion_estado")
      .select("folio, grupo")
      .ilike("folio", patron)
      .order("generado_en", { ascending: false })
      .limit(LIMITE),
    buscarRecibos(),
  ]);

  // Un grupo que falla no tumba la búsqueda (se muestran los demás), pero
  // queda en el log del servidor.
  const fallidas = Object.entries({
    porNumero,
    proyectos,
    modelos,
    foliosCalidad,
    foliosProduccion,
  }).filter(([, r]) => r.error);
  for (const [nombre, r] of fallidas) {
    console.error(`[buscar] ${nombre}: ${r.error?.message}`);
  }

  // PM que coinciden por proyecto o cliente (segunda consulta: .or() no cruza
  // tablas relacionadas).
  const idsProyecto = (proyectos.data ?? []).map((p) => p.id as string);
  const porProyecto = idsProyecto.length
    ? await supabase
        .from("pedidos")
        .select(selectPedido)
        .in("proyecto_id", idsProyecto)
        .is("eliminado_en", null)
        .is("eliminado_definitivo_en", null)
        .order("created_at", { ascending: false })
        .limit(20)
        .returns<PedidoRow[]>()
    : { data: [] as PedidoRow[] };

  const pedidos = new Map<string, PedidoRow>();
  for (const p of [...(porNumero.data ?? []), ...(porProyecto.data ?? [])])
    pedidos.set(p.id, p);

  const ots = new Map<string, PedidoRow[]>();
  for (const p of pedidos.values()) {
    if (!p.orden_trabajo) continue;
    ots.set(p.orden_trabajo, [...(ots.get(p.orden_trabajo) ?? []), p]);
  }
  agregar(
    "O.T.",
    [...ots.entries()].slice(0, LIMITE).map(([ot, pms]) => ({
      tipo: "ot",
      titulo: `O.T. ${ot}`,
      detalle: [pms[0].proyectos?.nombre, `${pms.length} PM`]
        .filter(Boolean)
        .join(" · "),
      href: hrefOrdenTrabajo(ot),
    })),
  );

  agregar(
    "PM",
    [...pedidos.values()]
      .sort((a, b) =>
        a.numero_pedido.localeCompare(b.numero_pedido, "es", { numeric: true }),
      )
      .slice(0, LIMITE)
      .map((p) => ({
        tipo: "pm",
        titulo: p.numero_pedido,
        detalle: [p.proyectos?.nombre, p.proyectos?.cliente]
          .filter(Boolean)
          .join(" · "),
        href: hrefPedido(area, p.id),
      })),
  );

  // Un renglón por modelo y PM (el mismo modelo se repite en varios ítems).
  const vistos = new Set<string>();
  const resultadosModelo: ResultadoBusqueda[] = [];
  for (const m of modelos.data ?? []) {
    const pm = m.pedido_versiones.pedidos;
    const clave = `${normalizarBusqueda(m.modelo)}|${pm.id}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    resultadosModelo.push({
      tipo: "modelo",
      titulo: m.modelo,
      detalle: [pm.numero_pedido, m.descripcion].filter(Boolean).join(" · "),
      href: hrefModelo(pm.id, m.modelo),
    });
    if (resultadosModelo.length === LIMITE) break;
  }
  agregar("Modelos", resultadosModelo);

  agregar(
    "Folios de calidad",
    (foliosCalidad.data ?? []).map((f) => ({
      tipo: "folio-calidad",
      titulo: f.folio as string,
      detalle: f.aprobado ? "Aprobado" : "No aprobado",
      href: `/calidad/folios?q=${encodeURIComponent(f.folio as string)}`,
    })),
  );

  agregar(
    "Folios de producción",
    (foliosProduccion.data ?? []).map((f) => ({
      tipo: "folio-produccion",
      titulo: f.folio as string,
      detalle:
        f.grupo === "activos"
          ? "Activo"
          : f.grupo === "eliminados"
            ? "Eliminado"
            : "Cancelado",
      href: `/produccion/folios?q=${encodeURIComponent(f.folio as string)}`,
    })),
  );

  agregar("Recibos", recibos);

  return NextResponse.json({ grupos });
}
