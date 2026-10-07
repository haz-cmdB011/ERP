"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import IconoMenu, { type NombreIcono } from "./iconos-menu";
import { useCerrarMenu } from "./menu-area";

// Enlace del menú lateral de cada área (MenuArea: Pedidos / Cargar Excel...),
// con su ícono. Marca la pantalla actual. Las rutas de un solo tramo ("/planeacion")
// son el inicio del área y solo coinciden exactas o con las rutas de `tambien`
// (el detalle de un pedido sigue siendo "Pedidos"); las demás coinciden por
// prefijo ("/estimaciones/recibos" también cubre "/estimaciones/recibos/acabados").
// `excluye` ("estado=pendiente") separa dos enlaces a la misma ruta que solo se
// distinguen por un parámetro de la URL.
export default function SubnavLink({
  href,
  tambien = [],
  excluye,
  icono,
  children,
}: {
  href: string;
  tambien?: string[];
  excluye?: string;
  icono: NombreIcono;
  children: React.ReactNode;
}) {
  const cerrarMenu = useCerrarMenu();
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
      onClick={cerrarMenu}
      aria-current={activo ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
        activo
          ? "bg-brand-100 font-semibold text-slate-900 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-brand-500"
          : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <IconoMenu
        nombre={icono}
        className={`h-5 w-5 shrink-0 ${activo ? "text-brand-700" : "text-slate-500"}`}
      />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">{children}</span>
    </Link>
  );
}
