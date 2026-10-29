"use client";

import { usePathname } from "next/navigation";
import BarraPestanas, { type ItemPestana } from "@/components/barra-pestanas";

// Las secciones del menú de Producción que agrupan varias pantallas. Cada pantalla conserva su
// propia dirección (los enlaces de otras partes siguen sirviendo); aquí solo se muestran juntas.
// Cada pestaña lleva su icono (los nombres salen de components/iconos-menu.tsx).
const SECCIONES = {
  archivo: {
    etiqueta: "Secciones del archivo",
    items: [
      { id: "cancelados", etiqueta: "Cancelados", icono: "cancelados", href: "/produccion/cancelados" },
      { id: "folios", etiqueta: "Folios", icono: "folios", href: "/produccion/folios" },
    ],
  },
} satisfies Record<string, { etiqueta: string; items: ItemPestana[] }>;

export default function PestanasSeccion({ seccion }: { seccion: keyof typeof SECCIONES }) {
  const pathname = usePathname();
  const { etiqueta, items } = SECCIONES[seccion];
  const activa = items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.id ?? items[0].id;
  return <BarraPestanas items={items} activa={activa} etiqueta={etiqueta} />;
}
