"use client";

import { usePathname } from "next/navigation";
import BarraPestanas, { type ItemPestana } from "@/components/barra-pestanas";

// Las secciones del menú de Producción que agrupan varias pantallas. Cada pantalla conserva su
// propia dirección (los enlaces de otras partes siguen sirviendo); aquí solo se muestran juntas.
const SECCIONES = {
  taller: {
    etiqueta: "Secciones del taller",
    items: [
      { id: "taller", etiqueta: "Taller", href: "/produccion/taller" },
      { id: "rechazos", etiqueta: "Rechazos de Calidad", href: "/produccion/rechazos" },
    ],
  },
  archivo: {
    etiqueta: "Secciones del archivo",
    items: [
      { id: "cancelados", etiqueta: "Cancelados", href: "/produccion/cancelados" },
      { id: "folios", etiqueta: "Folios", href: "/produccion/folios" },
    ],
  },
} satisfies Record<string, { etiqueta: string; items: ItemPestana[] }>;

export default function PestanasSeccion({ seccion }: { seccion: keyof typeof SECCIONES }) {
  const pathname = usePathname();
  const { etiqueta, items } = SECCIONES[seccion];
  const activa = items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.id ?? items[0].id;
  return <BarraPestanas items={items} activa={activa} etiqueta={etiqueta} />;
}
