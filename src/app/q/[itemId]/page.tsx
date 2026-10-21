import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leer } from "@/lib/supabase/leer";
import {
  getPerfilActual,
  puedeEditarProduccion,
  puedeEvaluarCalidad,
} from "@/lib/auth/get-perfil";
import { inicioDeRol } from "@/lib/auth/acceso";
import { destinoDeLogin } from "@/lib/seguridad/ruta-protegida";
import SinAcceso from "@/components/sin-acceso";
import ChipEstado, { type TonoChip } from "@/components/chip-estado";
import ChipPlazo from "@/app/produccion/chip-plazo";
import { esUuid } from "@/lib/produccion/qr-viajero";
import {
  hoyMexico,
  type AsignacionResumen,
  type EncargadoEquipo,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import { enTaller } from "@/lib/produccion/atrasos";
import { plazosDePedidos } from "@/lib/produccion/cargar-taller";
import { admiteElectrificacion } from "@/lib/produccion/electrificacion";
import { admiteSuperficieSolida } from "@/lib/produccion/superficie-solida";
import {
  avancePaso,
  estadoObra,
  indiceSiguiente,
  opcionesDePasos,
  siguientePaso,
  type EstadoProceso,
  type MuebleFlujo,
} from "@/lib/produccion/flujo-mueble";
import { etiquetaPaso, rutaSugerida } from "@/lib/produccion/ruta";
import { cargarRutas } from "@/lib/produccion/rutas-db";
import { revisionFinalActiva } from "@/lib/calidad/ajustes-flujo";
import { cargarRevisionFinal } from "@/lib/calidad/revision-final";
import { lotesPorEvaluar, normalizarLote, type LoteCalidad } from "@/lib/calidad/lotes";
import { panelCalidadQr } from "@/lib/trazabilidad/calidad-qr";
import {
  AREA_QR_LABELS,
  accionesQr,
  areaQrElegida,
  areasQrDePerfil,
  type AreaQr,
} from "@/lib/trazabilidad/areas-qr";
import { lineaTiempoMueble } from "@/lib/trazabilidad/linea-tiempo-mueble";
import { cargarLineaTiempo } from "@/lib/trazabilidad/linea-tiempo-db";
import LineaTiempoMueble from "./linea-tiempo";
import AsignarQr, { type RechazoQr } from "./asignar-qr";
import CalidadQr from "./calidad-qr";
import PagoQr from "./pago-qr";
import { cobrosDelMueble, resumenPago, type ResumenPago } from "@/lib/trazabilidad/pago-maquilador";
import { cargarRecibosDeOt } from "@/lib/trazabilidad/pago-maquilador-db";
import PlanosItem from "@/app/planeacion/pedidos/[id]/planos-item";
import { getPlanosPorItem, pmDePlanos } from "@/lib/planos/planos-por-item";

export const metadata: Metadata = { title: "Mueble" };

interface ItemEscaneado {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  parent_item_id: string | null;
  estado_liberacion: string;
  liberado_en: string | null;
  liberado_por: string | null;
  eliminacion_solicitada_en: string | null;
  estado_revision: string | null;
  pedido_versiones: {
    pedido_id: string;
    numero_version: number;
    es_version_activa: boolean;
    pedidos: {
      id: string;
      numero_pedido: string;
      orden_trabajo: string | null;
      fecha_pedido: string | null;
      cancelado_en: string | null;
      eliminado_en: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    } | null;
  } | null;
}

const ESTADO_PAGO: Record<ResumenPago["estado"], { tono: TonoChip; texto: string }> = {
  sin_recibo: { tono: "neutro", texto: "Sin recibo" },
  por_pagar: { tono: "alerta", texto: "Por pagar" },
  pagado: { tono: "ok", texto: "Pagado" },
};

const ESTADO_PASO: Record<EstadoProceso, { tono: TonoChip; texto: string }> = {
  terminado: { tono: "ok", texto: "Terminado" },
  en_proceso: { tono: "proceso", texto: "En proceso" },
  sin_asignar: { tono: "neutro", texto: "Sin asignar" },
};

// Destino del QR de la Hoja de Viajero: /q/<ítem>. El QR lleva solo el id del mueble (la
// dirección completa de la hoja lleva dos ids y daba un código tan denso que el celular lo
// leía mal). Muestra la ficha del mueble con su historial y, en una pestaña por área, lo que
// esa área hace con él; cada quien ve la de su área (el desarrollador, todas). Las hojas ya
// impresas, que traen la dirección larga, siguen abriendo la hoja de viajero.
export default async function FichaMuebleQrPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ area?: string; componente?: string }>;
}) {
  const { itemId } = await params;
  const { area: areaPedida, componente } = await searchParams;
  if (!esUuid(itemId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(destinoDeLogin(`/q/${itemId}`, ""));

  const perfil = await getPerfilActual(supabase);
  // La base no les deja leer el mueble: mejor decirlo que mostrar "no encontrado".
  if (perfil?.rol === "maquilador") {
    return (
      <SinAcceso
        titulo="Este QR es del personal interno"
        mensaje="Tu cuenta es de maquilador y solo tiene acceso a Estimaciones."
        hrefInicio={inicioDeRol(perfil.rol)}
        etiquetaInicio="Ir a mis recibos"
      />
    );
  }
  if (!perfil || perfil.rol === "usuario") {
    return (
      <SinAcceso
        titulo="Tu cuenta está pendiente de aprobación"
        mensaje="Un administrador debe asignarte un rol y un área para que puedas ver este mueble."
        hrefInicio="/planeacion/cuenta"
        etiquetaInicio="Ir a mi perfil"
      />
    );
  }

  const item = await leer(
    supabase
      .from("planeacion_items")
      .select(
        "id, item_code, tipo_registro, modelo, descripcion, cantidad_total, unidad, parent_item_id, estado_liberacion, liberado_en, liberado_por, eliminacion_solicitada_en, estado_revision, pedido_versiones!inner ( pedido_id, numero_version, es_version_activa, pedidos!inner ( id, numero_pedido, orden_trabajo, fecha_pedido, cancelado_en, eliminado_en, proyectos ( nombre, cliente ) ) )"
      )
      .eq("id", itemId)
      .maybeSingle<ItemEscaneado>(),
    "planeacion_items"
  );
  const pedido = item?.pedido_versiones?.pedidos;
  if (!item || !pedido || pedido.eliminado_en) notFound();

  // La ficha es del mueble padre: el QR de un componente lleva a su mueble.
  if (item.tipo_registro === "FU" && item.parent_item_id) {
    const q = new URLSearchParams({ componente: String(item.item_code) });
    if (areaPedida) q.set("area", areaPedida);
    redirect(`/q/${item.parent_item_id}?${q.toString()}`);
  }

  const hoy = hoyMexico();
  const [componentes, asignaciones, folio, plazos, rutas, finalActiva, planos, recibosOt] = await Promise.all([
    leer(
      supabase
        .from("planeacion_items")
        .select("id, item_code, modelo, descripcion")
        .eq("parent_item_id", item.id)
        .returns<{ id: string; item_code: number; modelo: string | null; descripcion: string | null }[]>(),
      "los componentes del mueble"
    ),
    leer(
      supabase
        .from("asignaciones_produccion_resumen")
        .select("*")
        .eq("planeacion_item_id", item.id)
        .returns<AsignacionResumen[]>(),
      "asignaciones_produccion_resumen"
    ),
    leer(
      supabase
        .from("folios_produccion")
        .select("folio, generado_en")
        .eq("planeacion_item_id", item.id)
        .maybeSingle<{ folio: string; generado_en: string }>(),
      "folios_produccion"
    ),
    plazosDePedidos(supabase, [pedido.id], hoy),
    cargarRutas(supabase, [item.id]),
    revisionFinalActiva(supabase),
    // Los datos del plano (especificación, acabados, notas): el PDF vive en el servidor de Ingeniería.
    getPlanosPorItem(supabase, pmDePlanos(pedido), [item]),
    cargarRecibosDeOt(supabase, pedido.orden_trabajo ?? pedido.numero_pedido),
  ]);
  const cobros = cobrosDelMueble(
    {
      id: item.id,
      modelo: item.modelo,
      descripcion: item.descripcion,
      ot: pedido.orden_trabajo ?? pedido.numero_pedido,
    },
    recibosOt
  );
  const pago = resumenPago(cobros);

  const hijos = (componentes ?? []).flatMap((c) => (c.descripcion ? [c.descripcion] : []));
  const aplica: Record<Proceso, boolean> = {
    armado: true,
    barniz: true,
    electrificacion: admiteElectrificacion(item.descripcion, hijos),
    superficie_solida: admiteSuperficieSolida(item.descripcion, hijos),
  };
  const guardada = rutas.get(item.id);
  const resumenFinal = finalActiva ? (await cargarRevisionFinal(supabase, [item.id])).resumen.get(item.id) : null;
  const todas = asignaciones ?? [];
  const flujo: MuebleFlujo = {
    id: item.id,
    item_code: item.item_code,
    modelo: item.modelo,
    unidad: item.unidad,
    cantidad: Number(item.cantidad_total),
    aplica,
    ruta: guardada && guardada.pasos.length > 0 ? guardada.pasos : rutaSugerida(aplica),
    versionRuta: guardada?.version ?? 0,
    asignaciones: todas,
    revisionFinal: finalActiva ? { aprobadas: resumenFinal?.aprobadas ?? 0 } : null,
  };

  const eventos = lineaTiempoMueble(
    await cargarLineaTiempo(supabase, {
      item,
      componentes: componentes ?? [],
      folio: folio ?? null,
      asignaciones: todas,
      ruta: flujo.ruta,
      cobros,
    })
  );

  const liberado = item.estado_liberacion === "enviado_a_produccion";
  const sinTrabajo =
    !!pedido.cancelado_en || !!item.eliminacion_solicitada_en || item.estado_revision === "cancelado";
  const plazo = plazos.get(pedido.id);
  const siguiente = indiceSiguiente(flujo);
  const obra = estadoObra(flujo);
  const enTallerAhora = todas.filter(enTaller);
  const faltanEntregar =
    Math.round(enTallerAhora.reduce((s, a) => s + Number(a.cantidad) - Number(a.entregado), 0) * 100) / 100;
  // Lo que falta asignar en el paso donde va el mueble (sin contar retrabajos).
  const porAsignar = siguiente === null ? 0 : avancePaso(flujo, siguiente).disponible;
  const unidad = item.unidad ?? "pz";

  const areas = areasQrDePerfil(perfil);
  const area = areaQrElegida(areas, areaPedida);
  const acciones = area
    ? accionesQr(area, {
        itemId: item.id,
        pedidoId: pedido.id,
        numeroPedido: pedido.numero_pedido,
        proyecto: pedido.proyectos?.nombre ?? null,
        modelo: item.modelo,
        asignable: liberado && !sinTrabajo,
        enTaller: enTallerAhora.length > 0,
      })
    : [];

  // Asignar y reasignar desde el QR: solo en la pestaña de Producción y para quien puede
  // editar ahí (la base lo vuelve a revisar en crear_asignacion_produccion).
  const asignarAqui = area === "produccion" && puedeEditarProduccion(perfil) && liberado && !sinTrabajo;
  const [equipos, encargados, rechazosLote, rechazosFinal] = asignarAqui
    ? await Promise.all([
        leer(
          supabase
            .from("equipos_produccion")
            .select("id, nombre, encargado, es_planta, procesos, activo")
            .eq("activo", true)
            .order("es_planta", { ascending: false })
            .order("nombre")
            .returns<EquipoProduccion[]>(),
          "equipos_produccion"
        ),
        leer(
          supabase
            .from("encargados_equipo_produccion")
            .select("equipo_id, nombre")
            .order("nombre")
            .returns<EncargadoEquipo[]>(),
          "encargados_equipo_produccion"
        ),
        leer(
          supabase
            .from("rechazos_calidad")
            .select("informe_id, folio, motivo, proceso, equipo_id, por_reasignar")
            .eq("planeacion_item_id", item.id)
            .eq("vigente", true)
            .gt("por_reasignar", 0)
            .order("elaborado_en")
            .returns<
              {
                informe_id: string;
                folio: string;
                motivo: string | null;
                proceso: Proceso;
                equipo_id: string;
                por_reasignar: number | string;
              }[]
            >(),
          "los rechazos de Calidad del mueble"
        ),
        // Un paso quitado de la ruta no se puede reasignar (hay que volver a agregarlo).
        leer(
          supabase
            .from("rechazos_revision_final")
            .select("revision_id, folio, motivo, proceso, siguiente_proceso, por_reasignar")
            .eq("planeacion_item_id", item.id)
            .eq("vigente", true)
            .eq("paso_retirado", false)
            .gt("por_reasignar", 0)
            .order("elaborado_en")
            .returns<
              {
                revision_id: string;
                folio: string;
                motivo: string | null;
                proceso: Proceso;
                siguiente_proceso: Proceso | null;
                por_reasignar: number | string;
              }[]
            >(),
          "los rechazos de la revisión final del mueble"
        ),
      ])
    : [[], [], [], []];
  // Calidad: las entregas de este mueble con piezas por revisar (solo en su pestaña).
  const lotesCalidad =
    area === "calidad" && liberado
      ? lotesPorEvaluar(
          (
            (await leer(
              supabase
                .from("lotes_calidad")
                .select("*")
                .eq("planeacion_item_id", item.id)
                .returns<LoteCalidad[]>(),
              "lotes_calidad"
            )) ?? []
          ).map(normalizarLote)
        )
      : [];
  const puedeEvaluar = puedeEvaluarCalidad(perfil);
  // Pasos guardados de la ruta: con la sugerida (sin guardar) no hay a dónde regresar lo rechazado.
  const pasosRegreso = flujo.ruta.flatMap((p, n) =>
    p.id ? [{ id: p.id, etiqueta: `${n + 1}. ${etiquetaPaso(flujo.ruta, n)}` }] : []
  );

  const rechazos: RechazoQr[] = [
    ...(rechazosLote ?? []).map((r) => ({
      id: r.informe_id,
      folio: r.folio,
      revisionFinal: false,
      proceso: r.proceso,
      equipoOriginalId: r.equipo_id,
      pendiente: Number(r.por_reasignar),
      motivo: r.motivo,
    })),
    ...(rechazosFinal ?? []).map((r) => ({
      id: r.revision_id,
      folio: r.folio,
      revisionFinal: true,
      proceso: r.siguiente_proceso ?? r.proceso,
      equipoOriginalId: "",
      pendiente: Number(r.por_reasignar),
      motivo: r.motivo,
    })),
  ];
  const hrefArea = (a: AreaQr) => {
    const q = new URLSearchParams({ area: a });
    if (componente) q.set("componente", componente);
    return `/q/${item.id}?${q.toString()}`;
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {pedido.numero_pedido}
          {folio?.folio ? ` · ${folio.folio}` : ""}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {item.modelo ?? `Ítem ${item.item_code}`}
        </h1>
        <p className="text-sm text-slate-600">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <p className="line-clamp-3 text-sm text-slate-500">{item.descripcion?.split("\n")[0]}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
          Ítem {item.item_code} · {Number(item.cantidad_total)} {item.unidad}
          {plazo && <ChipPlazo plazo={plazo} fecha={plazo.fecha} />}
        </p>
        <PlanosItem planos={planos[item.id] ?? []} />
      </header>

      {componente && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          El QR era del componente {componente}; aquí está su mueble.
        </p>
      )}
      {item.pedido_versiones && !item.pedido_versiones.es_version_activa && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Este QR es de una versión anterior del PM (v{item.pedido_versiones.numero_version}). Puede
          haber cambiado; revisa el pedido.
        </p>
      )}
      {sinTrabajo && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Este mueble o su PM está cancelado o eliminado: no debería seguir en taller.
        </p>
      )}

      <section aria-labelledby="ruta-titulo" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ruta-titulo" className="text-sm font-semibold text-slate-700">
            Ruta
          </h2>
          {liberado && (
            <p className="text-sm font-medium text-slate-900">
              {obra === "liberado"
                ? "Liberado a obra"
                : siguiente === null && obra === "en_revision_final"
                  ? "En revisión final de Calidad"
                  : siguientePaso(flujo)}
            </p>
          )}
        </div>
        {!liberado ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Este mueble todavía no está liberado a producción.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {flujo.ruta.map((paso, i) => {
              const avance = avancePaso(flujo, i);
              const estado = ESTADO_PASO[avance.estado];
              return (
                <li
                  key={paso.id ?? `${paso.proceso}-${i}`}
                  aria-current={i === siguiente ? "step" : undefined}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${i === siguiente ? "bg-brand-50/60" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-600">
                      {i + 1}
                    </span>
                    <span className="font-medium text-slate-900">{etiquetaPaso(flujo.ruta, i)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                    {avance.estado !== "sin_asignar" && (
                      <span>
                        {avance.entregado}/{flujo.cantidad}
                      </span>
                    )}
                    <ChipEstado tono={estado.tono}>{estado.texto}</ChipEstado>
                  </span>
                </li>
              );
            })}
            {resumenFinal && (
              <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-600">
                    {flujo.ruta.length + 1}
                  </span>
                  <span className="font-medium text-slate-900">Revisión final</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                  <span>
                    {resumenFinal.aprobadas}/{flujo.cantidad}
                  </span>
                  <ChipEstado tono={resumenFinal.liberado_a_obra ? "ok" : resumenFinal.pendientes > 0 ? "alerta" : "neutro"}>
                    {resumenFinal.liberado_a_obra
                      ? "Liberado a obra"
                      : resumenFinal.pendientes > 0
                        ? `${resumenFinal.pendientes} por revisar`
                        : "Esperando piezas"}
                  </ChipEstado>
                </span>
              </li>
            )}
            <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-600">
                  {flujo.ruta.length + (resumenFinal ? 2 : 1)}
                </span>
                <span className="font-medium text-slate-900">Pago al maquilador</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                {pago.estado !== "sin_recibo" && (
                  <span title="Piezas pagadas de las cobradas en recibos">
                    {pago.pagado}/{pago.cobrado}
                  </span>
                )}
                <ChipEstado tono={ESTADO_PAGO[pago.estado].tono}>{ESTADO_PAGO[pago.estado].texto}</ChipEstado>
              </span>
            </li>
          </ol>
        )}
      </section>

      {area ? (
        <section aria-labelledby="acciones-titulo" className="flex flex-col gap-3">
          <h2 id="acciones-titulo" className="sr-only">
            Qué hacer con este mueble
          </h2>
          {areas.length > 1 && (
            <nav aria-label="Áreas" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-4">
              {areas.map((a) => (
                <Link
                  key={a}
                  href={hrefArea(a)}
                  replace
                  scroll={false}
                  aria-current={a === area ? "page" : undefined}
                  className={`whitespace-nowrap rounded-md px-2 py-1.5 text-center text-sm font-medium transition-colors ${
                    a === area ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {AREA_QR_LABELS[a]}
                </Link>
              ))}
            </nav>
          )}
          {area === "produccion" && liberado && !sinTrabajo && (
            <p className="text-sm text-slate-600">
              {enTallerAhora.length === 0
                ? "No hay nada de este mueble en taller."
                : `En taller: ${enTallerAhora.length} asignación(es), faltan ${faltanEntregar} ${unidad} por entregar.`}
              {siguiente !== null &&
                porAsignar > 0 &&
                ` Faltan ${porAsignar} ${unidad} por asignar en ${etiquetaPaso(flujo.ruta, siguiente)}.`}
            </p>
          )}
          {area === "estimaciones" && <PagoQr cobros={cobros} pago={pago} unidad={item.unidad} />}
          {area === "calidad" && liberado && !sinTrabajo && (
            <CalidadQr
              panel={panelCalidadQr(resumenFinal ?? null, puedeEvaluar)}
              itemId={item.id}
              titulo={`${pedido.numero_pedido} · ${item.modelo ?? `ítem ${item.item_code}`}`}
              unidad={item.unidad}
              resumen={resumenFinal ?? null}
              pasos={pasosRegreso}
              lotes={lotesCalidad}
              puedeEvaluar={puedeEvaluar}
            />
          )}
          {asignarAqui && (
            <AsignarQr
              itemId={item.id}
              descripcion={`${pedido.numero_pedido} · ítem ${item.item_code}${item.modelo ? ` · ${item.modelo}` : ""}`}
              unidad={item.unidad}
              pasos={opcionesDePasos(flujo)}
              pasoInicial={siguiente}
              equipos={equipos ?? []}
              encargados={encargados ?? []}
              rechazos={rechazos}
            />
          )}
          <ul className="flex flex-col gap-2">
            {acciones.map((a) => (
              <li key={a.href}>
                <Link
                  href={a.href}
                  className={`flex min-h-11 flex-col justify-center rounded-xl px-4 py-2.5 transition-colors ${
                    a.principal
                      ? "bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400"
                      : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-sm font-semibold">{a.etiqueta}</span>
                  <span className={`text-xs ${a.principal ? "text-on-brand/80" : "text-slate-500"}`}>{a.detalle}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Tu área no tiene acciones con este mueble; aquí está su historial.
        </p>
      )}

      <section aria-labelledby="historial-titulo" className="flex flex-col gap-3 border-t border-slate-200 pt-4">
        <h2 id="historial-titulo" className="text-sm font-semibold text-slate-700">
          Historial
        </h2>
        <LineaTiempoMueble eventos={eventos} />
      </section>
    </main>
  );
}
