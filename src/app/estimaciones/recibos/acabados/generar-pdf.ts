import { generarPdfCarta } from "@/lib/pdf/generar-pdf-carta";

// Recibos de Estimaciones: mismo generador tamaño carta que el resto del
// ERP (ver src/lib/pdf/generar-pdf-carta.ts).
export async function generarPdfDesdeElemento(
  elemento: HTMLElement,
  nombreArchivo: string
): Promise<void> {
  await generarPdfCarta([elemento], nombreArchivo);
}
