import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEvaluarCalidad } from "@/lib/auth/get-perfil";
import { paginarTodo } from "@/lib/supabase/paginar";
import { validarContenidoExcel } from "@/lib/seguridad/excel";
import { consumirLimite, respuestaLimite, segundosParaReabrir } from "@/lib/seguridad/limite-tasa";
import {
  NOMBRE_CAMPO,
  clasificarImportacion,
  leerIncidenciasDeLibro,
  type CampoActualizable,
  type ExistenteParaComparar,
} from "@/lib/calidad/importar-incidencias";
import type { NuevaIncidencia } from "@/lib/calidad/incidencias";

export const runtime = "nodejs";
export const maxDuration = 60;

// El libro de control pesa unos cientos de KB; 8 MB deja de sobra y no pasa del tope de la plataforma.
const MAX_BYTES = 8 * 1024 * 1024;
const LOTE = 200;
const MUESTRA = 6;
const MAX_OMITIDAS_EN_PANTALLA = 15;

// Importa el Excel de control de no conformidades (hojas MADERA y METAL).
//   POST ?modo=simular  → solo cuenta: qué es nuevo, qué cambió, qué ya estaba y qué se omite (no escribe nada).
//   POST ?modo=aplicar  → agrega lo nuevo y actualiza lo que el Excel trae distinto en reportes ya cargados
//                         (cerrado, motivo, textos…). Una celda vacía del Excel no borra nada y un reporte
//                         cerrado en la app no se reabre. Dice cuántos agregó y cuántos actualizó.
// Solo Calidad (la RLS de la tabla también lo exige: las filas se escriben con la sesión de quien importa).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!puedeEvaluarCalidad(perfil)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const modo = request.nextUrl.searchParams.get("modo") === "aplicar" ? "aplicar" : "simular";

  const tope = { clave: `incidencias-importar:${perfil.userId}`, maximo: 30, ventanaSegundos: 600 };
  if (!(await consumirLimite(tope))) {
    const espera = segundosParaReabrir(tope.ventanaSegundos);
    const minutos = Math.max(1, Math.ceil(espera / 60));
    return respuestaLimite(
      `Has importado muchas veces en poco tiempo. Espera ${minutos === 1 ? "1 minuto" : `${minutos} minutos`} e inténtalo de nuevo.`,
      espera
    );
  }

  let archivo: File | null = null;
  try {
    const formulario = await request.formData();
    const valor = formulario.get("archivo");
    archivo = valor instanceof File ? valor : null;
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo enviado." }, { status: 400 });
  }
  if (!archivo || archivo.size === 0) {
    return NextResponse.json({ error: "Elige el Excel de control." }, { status: 400 });
  }
  if (!/\.(xlsx|xlsm)$/i.test(archivo.name)) {
    return NextResponse.json({ error: "El archivo debe ser un Excel (.xlsx o .xlsm)." }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ error: "El archivo pesa demasiado para ser el Excel de control (máximo 8 MB)." }, { status: 413 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const contenido = validarContenidoExcel(buffer);
  if (!contenido.ok) return NextResponse.json({ error: contenido.motivo }, { status: 400 });

  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return NextResponse.json({ error: "No se pudo abrir el Excel: está dañado o no es un libro de Excel." }, { status: 400 });
  }

  const lectura = leerIncidenciasDeLibro(libro);
  if (lectura.hojas.length === 0) {
    return NextResponse.json(
      {
        error: `No encuentro hojas de madera ni de metal. Se esperan nombres como "MADERA 26" y "METAL 26"; el libro trae: ${
          lectura.hojasIgnoradas.join(", ") || "ninguna hoja"
        }.`,
      },
      { status: 422 }
    );
  }

  let existentes: ExistenteParaComparar[];
  try {
    existentes = await paginarTodo<ExistenteParaComparar>(
      (desde, hasta) =>
        supabase
          .from("incidencias_calidad")
          .select(
            "id, origen_importacion, linea, tipo, fecha, proyecto, muebles, motivo, categoria_motivo, areas, areas_reporta, estado, auditor, descripcion, solucion, seguimiento"
          )
          .order("id", { ascending: true })
          .range(desde, hasta)
          .returns<ExistenteParaComparar[]>(),
      { contexto: "las no conformidades" }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudieron leer las no conformidades" },
      { status: 500 }
    );
  }

  const { nuevas, sinCambios, aActualizar, cerradasEnLaApp, repetidasPorContenido } = clasificarImportacion(
    lectura.incidencias,
    existentes
  );

  // Cuántos reportes cambian en cada campo (para la vista previa).
  const porCampo = new Map<CampoActualizable, number>();
  for (const a of aActualizar) for (const c of a.campos) porCampo.set(c, (porCampo.get(c) ?? 0) + 1);

  const resumen = {
    modo,
    hojas: lectura.hojas,
    hojasIgnoradas: lectura.hojasIgnoradas,
    leidas: lectura.incidencias.length + lectura.omitidas.length,
    nuevas: nuevas.length,
    sinCambios,
    actualizar: aActualizar.length,
    cambiosPorCampo: [...porCampo].map(([campo, filas]) => ({ campo: NOMBRE_CAMPO[campo], filas })),
    muestraActualizar: aActualizar.slice(0, MUESTRA).map((a) => ({
      etiqueta: a.etiqueta,
      campos: a.campos.map((c) => NOMBRE_CAMPO[c]),
      cierra: a.cambios.estado === "cerrado",
    })),
    cerradasEnLaApp,
    repetidasPorContenido,
    omitidas: lectura.omitidas.length,
    detalleOmitidas: lectura.omitidas.slice(0, MAX_OMITIDAS_EN_PANTALLA),
    avisos: [...lectura.avisos].map(([aviso, filas]) => ({ aviso, filas })),
    muestra: nuevas.slice(0, MUESTRA).map((n) => ({
      fecha: n.fecha,
      linea: n.linea,
      tipo: n.tipo,
      proyecto: n.proyecto,
      muebles: n.muebles.slice(0, 3),
    })),
    agregadas: 0,
    actualizadas: 0,
  };

  if (modo === "simular" || (nuevas.length === 0 && aActualizar.length === 0)) return NextResponse.json(resumen);

  // Se escribe por lotes con la sesión de quien importa. Si un lote falla se dice cuántas alcanzaron a
  // entrar; repetir es seguro (lo que ya entró se reconoce por su clave y no se duplica).
  let agregadas = 0;
  for (let i = 0; i < nuevas.length; i += LOTE) {
    const lote: (NuevaIncidencia & { creado_por: string })[] = nuevas
      .slice(i, i + LOTE)
      .map((n) => ({ ...n, creado_por: perfil.userId }));
    const { data, error } = await supabase
      .from("incidencias_calidad")
      .upsert(lote, { onConflict: "origen_importacion", ignoreDuplicates: true })
      .select("id");
    if (error) {
      return NextResponse.json(
        {
          error: `Falló al guardar (${error.message}). Se agregaron ${agregadas} de ${nuevas.length}; vuelve a importar el mismo archivo para completar el resto, no se duplica nada.`,
          agregadas,
          actualizadas: 0,
        },
        { status: 500 }
      );
    }
    agregadas += data?.length ?? 0;
  }

  // Los reportes que el Excel corrige, de a diez a la vez para no saturar la base. Se escribe solo lo que cambia.
  let actualizadas = 0;
  for (let i = 0; i < aActualizar.length; i += 10) {
    const tanda = aActualizar.slice(i, i + 10);
    const resultados = await Promise.all(
      tanda.map((a) => supabase.from("incidencias_calidad").update(a.cambios).eq("id", a.id).select("id"))
    );
    for (const r of resultados) {
      if (r.error) {
        return NextResponse.json(
          {
            error: `Falló al actualizar (${r.error.message}). Se agregaron ${agregadas} y se actualizaron ${actualizadas}; vuelve a importar el mismo archivo para completar el resto, no se duplica nada.`,
            agregadas,
            actualizadas,
          },
          { status: 500 }
        );
      }
      if (r.data && r.data.length > 0) actualizadas++;
    }
  }
  return NextResponse.json({ ...resumen, agregadas, actualizadas });
}
