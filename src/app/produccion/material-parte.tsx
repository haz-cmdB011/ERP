import type { CSSProperties, ReactNode } from "react";
import type { TipoMaterial } from "@/lib/produccion/despiece";

// Cómo se reconoce el material de una parte del despiece: su color (la tarjeta se ilumina
// con él) y un icono, para no depender solo del color (daltonismo, pantallas del taller con
// poco brillo). Colores fijos, no del tema, para que se reconozcan igual en claro y oscuro;
// el híbrido mezcla madera y metal. `tinta` es el trazo del icono: la superficie sólida es
// blanca y su icono necesita un gris para verse.
export const COLORES_MATERIAL: Record<TipoMaterial, { etiqueta: string; colores: string[]; tinta: string }> = {
  madera: { etiqueta: "Madera", colores: ["#16a34a"], tinta: "#16a34a" },
  metal: { etiqueta: "Metal", colores: ["#2563eb"], tinta: "#2563eb" },
  superficie_solida: { etiqueta: "Superficie sólida", colores: ["#ffffff"], tinta: "#94a3b8" },
  hibrido: { etiqueta: "Híbrido", colores: ["#16a34a", "#2563eb"], tinta: "#16a34a" },
  tapiz: { etiqueta: "Tapiz", colores: ["#dc2626"], tinta: "#dc2626" },
  electrificacion: { etiqueta: "Electrificación", colores: ["#facc15"], tinta: "#ca8a04" },
  vidrio: { etiqueta: "Vidrio / cristal", colores: ["#22d3ee"], tinta: "#0891b2" },
  espejo: { etiqueta: "Espejo", colores: ["#94a3b8"], tinta: "#7c8ba1" },
  piedra: { etiqueta: "Piedra", colores: ["#a16207"], tinta: "#a16207" },
  otro: { etiqueta: "Sin material", colores: ["#64748b"], tinta: "#64748b" },
};

// La tarjeta "encendida": borde, resplandor y un tinte del color (hex + transparencia).
export function luzMaterial(tipo: TipoMaterial): CSSProperties {
  const [a, b = a] = COLORES_MATERIAL[tipo].colores;
  return {
    borderColor: `${a}cc`,
    boxShadow: `0 0 14px 1px ${a}55, 0 0 14px 1px ${b}40`,
    background: `linear-gradient(135deg, ${a}29, ${b}14)`,
  };
}

// Los trazos de cada icono (cuadro de 24). `b` es el segundo color (solo el híbrido).
const TRAZOS: Record<TipoMaterial, (b: string) => ReactNode> = {
  // El canto de un tronco: anillos de crecimiento y una grieta.
  madera: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5a4.5 4.5 0 1 1-4.5 4.5" />
      <circle cx="12" cy="12" r="1.25" />
      <path d="M13 11l6-5" />
    </>
  ),
  // Una tuerca hexagonal.
  metal: () => (
    <>
      <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />
      <circle cx="12" cy="12" r="3.25" />
    </>
  ),
  // Una cubierta vista en perspectiva: la losa y su canto.
  superficie_solida: () => (
    <>
      <path d="M2.5 10L12 5.5l9.5 4.5L12 14.5z" />
      <path d="M2.5 10v3.5l9.5 4.5 9.5-4.5V10" />
      <path d="M12 14.5V18" />
    </>
  ),
  // Una tabla con veta y un tornillo de metal.
  hibrido: (b) => (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="1.5" />
      <path d="M5 10.5c2-1 4 1 6 0M5 13.5c2-1 4 1 6 0" />
      <g stroke={b}>
        <circle cx="16.5" cy="12" r="2.6" />
        <path d="M15 12h3" />
      </g>
    </>
  ),
  // Un cojín capitonado.
  tapiz: () => (
    <>
      <path d="M5 5.5c3-1.2 11-1.2 14 0 1.2 3 1.2 10 0 13-3 1.2-11 1.2-14 0-1.2-3-1.2-10 0-13z" />
      <path d="M9 9l.01 0M15 9l.01 0M9 15l.01 0M15 15l.01 0M12 12l.01 0" strokeWidth="2.6" />
    </>
  ),
  // Un rayo.
  electrificacion: () => <path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z" />,
  // Un cristal con su reflejo.
  vidrio: () => (
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="1.5" />
      <path d="M8 11l4-4M8 16l7.5-7.5" />
    </>
  ),
  // Un espejo ovalado sobre su pie.
  espejo: () => (
    <>
      <ellipse cx="12" cy="10" rx="6" ry="7.5" />
      <path d="M9.5 7.5a3.5 3.5 0 0 1 2.5-1.6" />
      <path d="M12 17.5V21M8.5 21h7" />
    </>
  ),
  // Una piedra tallada en facetas.
  piedra: () => (
    <>
      <path d="M4 15l3-8 6-3 6 4 1.5 8-8.5 4.5z" />
      <path d="M7 7l4.5 4.5L13 4M11.5 11.5L12 20.5M11.5 11.5l9 4.5" />
    </>
  ),
  // Sin material: un cuadro punteado, a la espera de que se escriba.
  otro: () => <rect x="5" y="5" width="14" height="14" rx="2" strokeDasharray="3 2.5" />,
};

// Solo el icono, del color del material.
export function IconoMaterial({ tipo, className = "h-4 w-4" }: { tipo: TipoMaterial; className?: string }) {
  const { tinta, colores } = COLORES_MATERIAL[tipo];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={tinta}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {TRAZOS[tipo](colores[1] ?? tinta)}
    </svg>
  );
}

// El icono en su muestra: un cuadro teñido del color del material, como las muestras de
// acabados del taller. Lleva el nombre del material para lectores de pantalla y al pasar
// el cursor.
export function InsigniaMaterial({ tipo, tamano = "md" }: { tipo: TipoMaterial; tamano?: "sm" | "md" }) {
  const { etiqueta, colores } = COLORES_MATERIAL[tipo];
  const [a, b = a] = colores;
  return (
    <span
      role="img"
      aria-label={etiqueta}
      title={etiqueta}
      className={`inline-grid shrink-0 place-items-center rounded-md border ${
        tamano === "sm" ? "h-5 w-5" : "h-7 w-7"
      }`}
      style={{
        // La superficie sólida es blanca: su borde gris la separa del fondo claro.
        borderColor: tipo === "superficie_solida" ? "#cbd5e1" : `${a}66`,
        background: `linear-gradient(135deg, ${a}26 50%, ${b}26 50%)`,
      }}
    >
      <IconoMaterial tipo={tipo} className={tamano === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
    </span>
  );
}
