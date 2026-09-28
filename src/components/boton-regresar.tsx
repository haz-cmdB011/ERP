"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// Cuántas navegaciones internas lleva la pestaña. Vive a nivel de módulo
// para sobrevivir al cambio de layout entre áreas (Planeación → Calidad...).
// Si todavía no se ha navegado dentro de la app (se abrió un link directo o
// se escaneó un QR), "Regresar" no puede usar el historial —saldría del ERP
// o volvería al login— y en su lugar va a la página superior.
let navegaciones = 0;
let ultimaRuta: string | null = null;

// Página superior de la ruta actual, para cuando no hay historial.
function rutaSuperior(pathname: string, inicioArea: string, maquilador: boolean): string {
  // Hoja de viajero, viajero por lote o informe de calidad → su pedido.
  const subPedido = pathname.match(/^(\/[^/]+\/pedidos\/[^/]+)\/(viajero|viajero-lote|informe)(\/|$)/);
  if (subPedido) return subPedido[1];
  // Detalle de un pedido → lista de pedidos del área.
  const pedido = pathname.match(/^\/([^/]+)\/pedidos\/[^/]+$/);
  if (pedido) return `/${pedido[1]}`;
  // Ficha o revisión de un recibo → registro de recibos.
  if (/^\/estimaciones\/(recibos\/[^/]+\/recibo|revision)\//.test(pathname)) {
    return maquilador ? "/estimaciones/mis-recibos" : "/estimaciones/registro";
  }
  // Modificar un recibo propio → Mis recibos.
  if (/^\/estimaciones\/mis-recibos\//.test(pathname)) return "/estimaciones/mis-recibos";
  // Captura de un tipo de recibo → generador.
  if (/^\/estimaciones\/recibos\/[^/]+$/.test(pathname)) return "/estimaciones/recibos";
  return inicioArea;
}

export default function BotonRegresar({
  inicioArea,
  maquilador = false,
}: {
  inicioArea: string;
  maquilador?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ultimaRuta !== null && ultimaRuta !== pathname) navegaciones += 1;
    ultimaRuta = pathname;
  }, [pathname]);

  if (pathname === inicioArea) return null;

  function regresar() {
    if (navegaciones > 0) {
      navegaciones -= 2; // el back cuenta como una navegación más
      router.back();
    } else {
      router.push(rutaSuperior(pathname, inicioArea, maquilador));
    }
  }

  return (
    <div className="px-6 pt-4 print:hidden">
      <button
        type="button"
        onClick={regresar}
        title="Regresar al panel anterior"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600"
      >
        ← Regresar
      </button>
    </div>
  );
}
