// Pegamento del navegador: guarda el detalle de una no conformidad y sube sus
// fotos. Se llama justo después de crear el informe (crear_informe_calidad o
// evaluar_entrega_calidad). Si algo falla, el informe ya existe: se devuelve un
// aviso para que Calidad lo complete desde la página del informe.

import { createClient } from "@/lib/supabase/client";
import { reducirFotoEnNavegador } from "@/lib/produccion/reducir-foto-navegador";
import { argumentosDetalle, type DetalleNoConformidad } from "./no-conformidad";

export async function subirFotosInforme(informeId: string, fotos: File[]): Promise<string | null> {
  let fallidas = 0;
  let motivo = "";
  for (const archivo of fotos) {
    try {
      const form = new FormData();
      form.append("foto", await reducirFotoEnNavegador(archivo), archivo.name);
      const r = await fetch(`/api/calidad/informes/${informeId}/fotos`, { method: "POST", body: form });
      if (!r.ok) {
        fallidas += 1;
        motivo = ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? motivo;
      }
    } catch {
      fallidas += 1;
      motivo = "Sin conexión.";
    }
  }
  return fallidas > 0
    ? `${fallidas} foto${fallidas === 1 ? "" : "s"} no se subieron${motivo ? ` (${motivo})` : ""}.`
    : null;
}

// Devuelve un texto de advertencia si el informe quedó incompleto, o null.
export async function guardarNoConformidad(
  informeId: string,
  detalle: DetalleNoConformidad,
  fotos: File[]
): Promise<string | null> {
  const { error } = await createClient().rpc("guardar_no_conformidad", argumentosDetalle(informeId, detalle));
  const avisos: string[] = [];
  if (error) avisos.push(`No se guardó el detalle de la no conformidad: ${error.message}.`);
  const falloFotos = await subirFotosInforme(informeId, fotos);
  if (falloFotos) avisos.push(falloFotos);
  return avisos.length > 0 ? `${avisos.join(" ")} Complétalo desde el informe.` : null;
}

// Cierra (o reabre) un reporte sin lote. Devuelve el error de la base, si hay.
export async function cerrarNoConformidad(informeId: string, cerrar: boolean): Promise<string | null> {
  const { error } = await createClient().rpc("cerrar_no_conformidad", {
    p_informe_id: informeId,
    p_cerrar: cerrar,
  });
  return error ? error.message : null;
}
