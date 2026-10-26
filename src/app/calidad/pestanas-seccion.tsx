"use client";

import { usePathname } from "next/navigation";
import BarraPestanas, { type ItemPestana } from "@/components/barra-pestanas";

// Las secciones del menú de Calidad que agrupan varias pantallas. Cada pantalla conserva su propia
// dirección (los enlaces de otras partes siguen sirviendo); aquí solo se muestran juntas.
const SECCIONES = {
  revision: {
    etiqueta: "Secciones de la revisión",
    items: [
      { id: "entregas", etiqueta: "Entregas", href: "/calidad/entregas" },
      { id: "incidencias", etiqueta: "No conformidades", href: "/calidad/incidencias" },
    ],
  },
  archivo: {
    etiqueta: "Secciones del archivo",
    items: [
      { id: "cancelados", etiqueta: "Cancelados", href: "/calidad/cancelados" },
      { id: "folios", etiqueta: "Folios de calidad", href: "/calidad/folios" },
    ],
  },
} satisfies Record<string, { etiqueta: string; items: ItemPestana[] }>;

export default function PestanasSeccion({ seccion }: { seccion: keyof typeof SECCIONES }) {
  const pathname = usePathname();
  const { etiqueta, items } = SECCIONES[seccion];
  const activa = items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.id ?? items[0].id;
  return <BarraPestanas items={items} activa={activa} etiqueta={etiqueta} />;
}
