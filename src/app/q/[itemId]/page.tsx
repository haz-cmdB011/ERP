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
import ChipPlazo from "@/app/produccion/chip-plazo";
import AsignarForm from "@/app/produccion/asignaciones/asignar-form";
import { Revisar } from "@/app/calidad/pedidos/[id]/revision-final";
import PlanosItem from "@/app/planeacion/pedidos/[id]/planos-item";
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
  avanceColumna,
  columnasMueble,
  partesConRuta,
  requiereDespiece,
  avancePaso,
  opcionesAsignar,
  rutasDelFlujo,
  siguienteAsignable,
  type MuebleFlujo,
} from "@/lib/produccion/flujo-mueble";
import { etiquetaPaso, pasosDeTodasLasRutas } from "@/lib/produccion/ruta";
import { cargarPartes } from "@/lib/produccion/partes-db";
import { cargarRutas } from "@/lib/produccion/rutas-db";
import { revisionFinalActiva } from "@/lib/calidad/ajustes-flujo";
import { cargarRevisionFinal } from "@/lib/calidad/revision-final";
import { lotesPorEvaluar, normalizarLote, type LoteCalidad } from "@/lib/calidad/lotes";
import { getPlanosPorItem, pmDePlanos } from "@/lib/planos/planos-por-item";
import { panelCalidadQr } from "@/lib/trazabilidad/calidad-qr";
import {
  AREA_QR_LABELS,
  areaQrElegida,
  areasQrDePerfil,
  panelQr,
  type AccionQr,
  type AreaQr,
} from "@/lib/trazabilidad/areas-qr";
import { resumenRuta, resumenRutaDeArea, type EntradaRuta } from "@/lib/trazabilidad/resumen-ruta";
import { lineaTiempoMueble } from "@/lib/trazabilidad/linea-tiempo-mueble";
import { cargarLineaTiempo } from "@/lib/trazabilidad/linea-tiempo-db";
import { cobrosDelMueble, resumenPago } from "@/lib/trazabilidad/pago-maquilador";
import { cargarRecibosDeOt } from "@/lib/trazabilidad/pago-maquilador-db";
import LineaTiempoMueble from "./linea-tiempo";
import RutaQr from "./ruta-qr";
import RechazosQr, { type RechazoQr } from "./rechazos-qr";
import EntregasCalidadQr from "./entregas-calidad-qr";
import PagoQr from "./pago-qr";

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

// El botón de lo que sigue (uno solo por pestaña) y los de "Más opciones".
const ESTILO_PRINCIPAL =
  "flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-base font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-400";
const ESTILO_OPCION =
  "flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50";

// Destino del QR de la Hoja de Viajero: /q/<ítem>. El QR lleva solo el id del mueble (la
// dirección completa de la hoja lleva dos ids y daba un código tan denso que el celular lo
// leía mal). Muestra la ficha del mueble, pensada para entenderse de un vistazo: dónde va
// (una frase y una barra; la ruta completa al tocarla), lo que sigue para el área de quien
// escanea (un botón, con una línea que dice por qué), las demás acciones como opciones y
// los últimos movimientos del historial. Cada quien ve la pestaña de su área (el
// desarrollador, todas). Las hojas ya impresas, que traen la dirección larga, siguen
// abriendo la hoja de viajero.
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
  const [componentes, asignaciones, folio, plazos, rutas, finalActiva, planos, recibosOt, partes] = await Promise.all([
    leer(
      supabase
        .from("planeacion_items")
        .select("id, item_code, modelo, descripcion, eliminacion_solicitada_en, estado_revision")
        .eq("parent_item_id", item.id)
        .returns<
          {
            id: string;
            item_code: number;
            modelo: string | null;
            descripcion: string | null;
            eliminacion_solicitada_en: string | null;
            estado_revision: string | null;
          }[]
        >(),
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
    // Partes del despiece: con componentes se asigna por partes.
    cargarPartes(supabase, [item.id]),
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
  const rutasMueble = rutasDelFlujo(rutas.get(item.id), aplica, partes.get(item.id) ?? []);
  const resumenFinal = finalActiva ? (await cargarRevisionFinal(supabase, [item.id])).resumen.get(item.id) : null;
  const todas = asignaciones ?? [];
  const flujo: MuebleFlujo = {
    id: item.id,
    item_code: item.item_code,
    modelo: item.modelo,
    unidad: item.unidad,
    cantidad: Number(item.cantidad_total),
    aplica,
    ruta: rutasMueble.ruta,
    versionRuta: rutas.get(item.id)?.version ?? 0,
    asignaciones: todas,
    revisionFinal: finalActiva ? { aprobadas: resumenFinal?.aprobadas ?? 0 } : null,
    partes: rutasMueble.partes,
    conComponentes: (componentes ?? []).some(
      (c) => !c.eliminacion_solicitada_en && c.estado_revision !== "cancelado"
    ),
  };

  const areas = areasQrDePerfil(perfil);
  const area = areaQrElegida(areas, areaPedida);
  // El pago al maquilador (en la ruta y en el historial) solo lo ve Estimaciones.
  const verPago = area === "estimaciones";

  const eventos = lineaTiempoMueble(
    await cargarLineaTiempo(supabase, {
      item,
      componentes: componentes ?? [],
      folio: folio ?? null,
      asignaciones: todas,
      ruta: flujo.ruta,
      cobros: verPago ? cobros : [],
    })
  );

  const liberado = item.estado_liberacion === "enviado_a_produccion";
  const sinTrabajo =
    !!pedido.cancelado_en || !!item.eliminacion_solicitada_en || item.estado_revision === "cancelado";
  const plazo = plazos.get(pedido.id);
  const unidad = item.unidad ?? "pz";
  const faltanEntregar =
    Math.round(todas.filter(enTaller).reduce((s, a) => s + Number(a.cantidad) - Number(a.entregado), 0) * 100) / 100;
  // Lo que se ofrece al asignar: lo que sigue (una parte o el mueble completo) o, si ya está
  // asignado, lo primero que todavía tenga lugar.
  const sigue = siguienteAsignable(flujo);

  const entradaRuta: EntradaRuta = {
    liberado,
    cantidad: flujo.cantidad,
    unidad,
    // Con despiece, un tramo por proceso (todas sus partes y el mueble completo; lo entregado
    // son los muebles completos que alcanza lo más atrasado); sin despiece, los pasos de su ruta.
    pasos:
      partesConRuta(flujo).length > 0
        ? columnasMueble(flujo).map((c) => {
            const a = avanceColumna(flujo, c);
            return { etiqueta: c.etiqueta, estado: a.estado, entregado: a.muebles };
          })
        : flujo.ruta.map((_, i) => {
            const a = avancePaso(flujo, i);
            return { etiqueta: etiquetaPaso(flujo.ruta, i), estado: a.estado, entregado: a.entregado };
          }),
    revisionFinal: resumenFinal
      ? {
          aprobadas: resumenFinal.aprobadas,
          pendientes: resumenFinal.pendientes,
          liberado: resumenFinal.liberado_a_obra,
        }
      : null,
    pago: verPago ? { estado: pago.estado, cobrado: pago.cobrado, pagado: pago.pagado } : null,
  };

  // La ruta completa (Producción, revisión final y pago) es solo del desarrollador; cada área
  // ve únicamente su tramo.
  const rutaCompleta = perfil.rol === "desarrollador";
  const ruta = rutaCompleta ? resumenRuta(entradaRuta) : area ? resumenRutaDeArea(entradaRuta, area) : null;

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
  const puedeEvaluar = puedeEvaluarCalidad(perfil);
  const lotesCalidad =
    area === "calidad" && liberado && puedeEvaluar
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
  const calidad = panelCalidadQr(resumenFinal ?? null, puedeEvaluar);
  // Pasos guardados de las rutas (de cada parte y del mueble): con la sugerida (sin guardar) no
  // hay a dónde regresar lo rechazado.
  const pasosRegreso = pasosDeTodasLasRutas(flujo.ruta, flujo.partes ?? []);

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

  const panel = area
    ? panelQr(area, {
        mueble: {
          itemId: item.id,
          pedidoId: pedido.id,
          numeroPedido: pedido.numero_pedido,
          proyecto: pedido.proyectos?.nombre ?? null,
          modelo: item.modelo,
          activo: liberado && !sinTrabajo,
        },
        unidad,
        produccion: {
          puedeAsignar: asignarAqui,
          porEntregar: faltanEntregar,
          porAsignar: sigue
            ? {
                paso: sigue.parte ? `${sigue.parte.descripcion} · ${sigue.paso.etiqueta}` : sigue.paso.etiqueta,
                cantidad: sigue.paso.disponible,
              }
            : null,
        },
        calidad: {
          revisionFinal: calidad.revisionFinal,
          pendientes: resumenFinal?.pendientes ?? 0,
          cantidad: flujo.cantidad,
          entregasPorRevisar: lotesCalidad.length,
        },
        pago: { estado: pago.estado, cobrado: pago.cobrado, pagado: pago.pagado, recibos: cobros.length },
      })
    : null;

  const descripcionMueble = `${pedido.numero_pedido} · ítem ${item.item_code}${item.modelo ? ` · ${item.modelo}` : ""}`;
  const tituloMueble = `${pedido.numero_pedido} · ${item.modelo ?? `ítem ${item.item_code}`}`;
  // Cada acción con el estilo que le toque: un enlace, o el formulario de asignar o el de la
  // revisión final, que se abren ahí mismo.
  const boton = (a: AccionQr, clase: string) => {
    switch (a.tipo) {
      case "enlace":
        return (
          <Link key={a.href} href={a.href} title={a.detalle} className={clase}>
            {a.etiqueta}
          </Link>
        );
      case "asignar":
        return (
          <AsignarForm
            key="asignar"
            itemId={item.id}
            descripcion={descripcionMueble}
            unidad={item.unidad}
            rutas={opcionesAsignar(flujo)}
            equipos={equipos ?? []}
            encargados={encargados ?? []}
            faltaDespiece={requiereDespiece(flujo)}
            inicial={sigue ? { parte: sigue.parte?.id ?? null, paso: sigue.paso.indice } : undefined}
            className={clase}
          >
            {a.etiqueta}
          </AsignarForm>
        );
      case "revision_final":
        return resumenFinal ? (
          <Revisar
            key="revision-final"
            mueble={{ id: item.id, unidad: item.unidad, resumen: resumenFinal, pasos: pasosRegreso }}
            titulo={tituloMueble}
            className={clase}
          >
            {a.etiqueta}
          </Revisar>
        ) : null;
    }
  };
  const hrefArea = (a: AreaQr) => {
    const q = new URLSearchParams({ area: a });
    if (componente) q.set("componente", componente);
    return `/q/${item.id}?${q.toString()}`;
  };
  // Las entregas por proceso de Calidad: abiertas si son la forma normal de evaluar
  // (revisión final apagada); si no, plegadas entre las opciones.
  const entregasCalidad =
    area === "calidad" && liberado && !sinTrabajo ? (
      <EntregasCalidadQr lotes={lotesCalidad} plegadas={calidad.entregasPlegadas} />
    ) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {pedido.numero_pedido}
          {folio?.folio ? ` · ${folio.folio}` : ""}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {item.modelo ?? `Ítem ${item.item_code}`}
        </h1>
        {item.descripcion && (
          <p className="line-clamp-1 text-sm text-slate-700">{item.descripcion.split("\n")[0]}</p>
        )}
        <p className="truncate text-xs text-slate-500">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
          <span>
            Ítem {item.item_code} · {Number(item.cantidad_total)} {item.unidad}
          </span>
          {plazo && <ChipPlazo plazo={plazo} fecha={plazo.fecha} />}
          <PlanosItem planos={planos[item.id] ?? []} />
        </div>
      </header>

      {componente && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          El QR era del componente {componente}; aquí está su mueble.
        </p>
      )}
      {item.pedido_versiones && !item.pedido_versiones.es_version_activa && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Este QR es de una versión anterior del PM (v{item.pedido_versiones.numero_version}). Puede haber
          cambiado; revisa el pedido.
        </p>
      )}
      {sinTrabajo && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Este mueble o su PM está cancelado o eliminado: no debería seguir en taller.
        </p>
      )}

      {ruta && ruta.tramos.length > 0 && <RutaQr resumen={ruta} completa={rutaCompleta} />}

      {area && panel ? (
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
          {asignarAqui && (
            <RechazosQr rechazos={rechazos} descripcion={descripcionMueble} unidad={item.unidad} equipos={equipos ?? []} />
          )}
          {(panel.principal || panel.ayuda) && (
            <div className="flex flex-col gap-1.5">
              {panel.principal && boton(panel.principal, ESTILO_PRINCIPAL)}
              {panel.ayuda && (
                <p className={`text-sm text-slate-600 ${panel.principal ? "text-center" : ""}`}>{panel.ayuda}</p>
              )}
            </div>
          )}
          {!calidad.entregasPlegadas && entregasCalidad}
          {area === "estimaciones" && <PagoQr cobros={cobros} pago={pago} unidad={item.unidad} />}
          {panel.otras.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {panel.principal ? "Más opciones" : "Opciones"}
              </p>
              <div className={`grid gap-2 ${panel.otras.length > 1 ? "grid-cols-2" : ""}`}>
                {panel.otras.map((a) => boton(a, ESTILO_OPCION))}
              </div>
              {calidad.entregasPlegadas && entregasCalidad}
            </div>
          )}
        </section>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Tu área no tiene acciones con este mueble; aquí está su historial.
        </p>
      )}

      <section aria-labelledby="historial-titulo" className="flex flex-col gap-3 border-t border-slate-200 pt-4">
        <h2 id="historial-titulo" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Últimos movimientos
        </h2>
        <LineaTiempoMueble eventos={eventos} />
      </section>
    </main>
  );
}
