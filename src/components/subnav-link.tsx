"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Enlace de la segunda fila de AreaNav (Pedidos / Cargar Excel...). Marca la
// pestaña de la pantalla actual. Las rutas de un solo tramo ("/planeacion")
// son el inicio del área y solo coinciden exactas o con las rutas de `tambien`
// (el detalle de un pedido sigue siendo "Pedidos"); las demás coinciden por
// prefijo ("/estimaciones/recibos" también cubre "/estimaciones/recibos/acabados").
// `excluye` ("estado=pendiente") separa dos enlaces a la misma ruta que solo se
// distinguen por un parámetro de la URL.
export default function SubnavLink({
  href,
  tambien = [],
  excluye,
  children,
}: {
  href: string;
  tambien?: string[];
  excluye?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const parametros = useSearchParams();

  const [ruta, consulta] = href.split("?");
  const esInicioDeArea = ruta.split("/").filter(Boolean).length === 1;
  const enRuta = (base: string) => pathname === base || pathname.startsWith(`${base}/`);

  let activo = esInicioDeArea ? pathname === ruta : enRuta(ruta);
  if (!activo) activo = tambien.some(enRuta);

  if (activo && consulta) {
    for (const [clave, valor] of new URLSearchParams(consulta)) {
      if (parametros.get(clave) !== valor) activo = false;
    }
  }
  if (activo && excluye) {
    const [clave, valor] = excluye.split("=");
    if (parametros.get(clave) === valor) activo = false;
  }

  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`relative -mb-px inline-flex items-center gap-1 border-b-2 px-0.5 py-3 text-sm transition-colors ${
        activo
          ? "subrayado-activo border-transparent font-semibold text-slate-900"
          : "border-transparent font-medium text-slate-500 hover:border-slate-300 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}
