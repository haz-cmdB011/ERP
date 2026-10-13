import Link from "next/link";
import { money } from "@/lib/estimaciones/motor-precio";
import type { Porcion } from "@/lib/estimaciones/reporte-dashboard";

// Gráficas del reporte semanal en SVG puro (sin librería). Los colores salen
// de las variables --serie-N de globals.css, que cambian con el modo oscuro.
// Cada marca lleva <title> (tooltip nativo) y todo dato también aparece en
// texto al lado: la gráfica nunca es la única forma de leerlo.

const colorSerie = (i: number) => `var(--serie-${(i % 8) + 1})`;

// El color de una porción: "Otros" va en gris, no gasta un color de la serie.
export function colorDe(porciones: Porcion[], i: number): string {
  return porciones[i].etiqueta === "Otros" ? "var(--serie-otros)" : colorSerie(i);
}

const fmtPorcentaje = (p: number) => `${p.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;

// Pastel (dona) con el total al centro y la leyenda al lado: nombre, importe y
// porcentaje de cada parte.
export function Pastel({
  porciones,
  titulo,
  centro,
  apilado = false,
  enlace,
}: {
  porciones: Porcion[];
  titulo: string;
  centro: string;
  // Leyenda debajo de la dona (para paneles angostos).
  apilado?: boolean;
  // Adónde lleva el nombre de una porción (null: sin enlace).
  enlace?: (p: Porcion) => string | null;
}) {
  const total = porciones.reduce((s, p) => s + p.importe, 0);
  const R = 70;
  const GROSOR = 30;
  // Hueco de 2 unidades (de 100) entre rebanadas cuando hay más de una.
  const hueco = porciones.length > 1 ? 0.8 : 0;
  let acumulado = 0;

  return (
    <div
      className={`flex flex-col items-center gap-4 ${apilado ? "" : "sm:flex-row sm:items-center"}`}
    >
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={titulo}
        className="anim-donut h-48 w-48 shrink-0 -rotate-90"
      >
        <circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke="var(--serie-pista)"
          strokeWidth={GROSOR}
        />
        {total > 0 &&
          porciones.map((p, i) => {
            const largo = (p.importe / total) * 100;
            const inicio = acumulado;
            acumulado += largo;
            return (
              <circle
                key={p.etiqueta}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={colorDe(porciones, i)}
                strokeWidth={GROSOR}
                pathLength={100}
                strokeDasharray={`${Math.max(largo - hueco, 0.01)} ${100 - Math.max(largo - hueco, 0.01)}`}
                strokeDashoffset={-inicio}
              >
                <title>{`${p.etiqueta}: ${money(p.importe)} (${fmtPorcentaje(p.porcentaje)})`}</title>
              </circle>
            );
          })}
        <g transform="rotate(90 100 100)" className="fill-slate-900">
          <text x="100" y="96" textAnchor="middle" fontSize="11" className="fill-slate-500">
            Total
          </text>
          <text x="100" y="114" textAnchor="middle" fontSize="15" fontWeight="600">
            {centro}
          </text>
        </g>
      </svg>

      <ul className="flex w-full min-w-0 flex-col gap-1.5 text-sm">
        {porciones.map((p, i) => (
          <li key={p.etiqueta} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ background: colorDe(porciones, i) }}
            />
            {enlace?.(p) ? (
              <Link
                href={enlace(p)!}
                className="min-w-0 flex-1 truncate text-slate-700 hover:text-brand-700 hover:underline"
                title={`${p.etiqueta}: ver sus recibos pagados`}
              >
                {p.etiqueta}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate text-slate-700" title={p.etiqueta}>
                {p.etiqueta}
              </span>
            )}
            <span className="font-mono text-xs tabular-nums text-slate-500">{money(p.importe)}</span>
            <span className="w-14 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
              {fmtPorcentaje(p.porcentaje)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface PuntoPeriodo {
  etiqueta: string;
  importe: number;
  detalle?: string;
}

// Barras por periodo (semana, mes o año). `resaltar`: índice del periodo que se está viendo; las
// demás van más tenues. `compacta`: versión pequeña para cada maquilador.
export function BarrasPorPeriodo({
  puntos,
  resaltar,
  compacta = false,
  titulo,
}: {
  puntos: PuntoPeriodo[];
  resaltar: number;
  compacta?: boolean;
  titulo: string;
}) {
  const ancho = compacta ? 160 : 960;
  const alto = compacta ? 44 : 170;
  const margenInferior = compacta ? 0 : 18;
  const margenSuperior = compacta ? 2 : 10;
  const util = alto - margenInferior - margenSuperior;
  const maximo = Math.max(...puntos.map((p) => p.importe), 0);
  const paso = ancho / puntos.length;
  const barra = paso * (compacta ? 0.62 : 0.55);

  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      role="img"
      aria-label={titulo}
      className={compacta ? "h-11 w-40" : "w-full"}
    >
      {!compacta && (
        <line
          x1="0"
          x2={ancho}
          y1={alto - margenInferior}
          y2={alto - margenInferior}
          stroke="var(--serie-pista)"
          strokeWidth="1"
        />
      )}
      {puntos.map((p, i) => {
        const h = maximo > 0 ? (p.importe / maximo) * util : 0;
        const x = i * paso + (paso - barra) / 2;
        const y = alto - margenInferior - h;
        return (
          <g key={`${p.etiqueta}-${i}`}>
            {/* Zona de toque más grande que la barra. */}
            <rect x={i * paso} y="0" width={paso} height={alto} fill="transparent">
              <title>{`${p.etiqueta}: ${money(p.importe)}${p.detalle ? ` · ${p.detalle}` : ""}`}</title>
            </rect>
            {p.importe > 0 ? (
              <rect
                x={x}
                y={y}
                width={barra}
                height={Math.max(h, 1)}
                rx="2"
                fill="var(--serie-1)"
                opacity={i === resaltar ? 1 : 0.45}
                pointerEvents="none"
                className="anim-barra"
                style={{ animationDelay: `${i * 45}ms` }}
              />
            ) : (
              <rect
                x={x}
                y={alto - margenInferior - 1.5}
                width={barra}
                height="1.5"
                fill="var(--serie-pista)"
                pointerEvents="none"
              />
            )}
            {!compacta && (
              <text
                x={i * paso + paso / 2}
                y={alto - 4}
                textAnchor="middle"
                fontSize="12"
                className={i === resaltar ? "fill-slate-900" : "fill-slate-500"}
                fontWeight={i === resaltar ? 600 : 400}
              >
                {p.etiqueta}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// "$12.3 k", "$1.2 M": cifras cortas para rotular las barras (el importe exacto
// va en el tooltip y en la tabla de al lado).
export function importeCompacto(n: number): string {
  const abs = Math.abs(n);
  const f = (v: number) => v.toLocaleString("es-MX", { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `$${f(n / 1_000_000)} M`;
  if (abs >= 1_000) return `$${f(n / 1_000)} k`;
  return `$${f(n)}`;
}

export interface GrupoComparado {
  etiqueta: string;
  actual: number;
  anterior: number;
}

// Barras agrupadas: por cada grupo (un área), el periodo anterior en gris y el
// actual en color, a la misma escala. La leyenda y los valores también van en
// texto (la tabla de al lado).
export function BarrasComparadas({
  grupos,
  etiquetaActual,
  etiquetaAnterior,
  titulo,
}: {
  grupos: GrupoComparado[];
  etiquetaActual: string;
  etiquetaAnterior: string;
  titulo: string;
}) {
  const ancho = 520;
  const alto = 200;
  const margenInferior = 22;
  const margenSuperior = 22;
  const util = alto - margenInferior - margenSuperior;
  const maximo = Math.max(...grupos.flatMap((g) => [g.actual, g.anterior]), 0);
  const paso = ancho / Math.max(grupos.length, 1);
  const barra = Math.min(paso * 0.28, 44);
  const base = alto - margenInferior;

  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={titulo} className="w-full">
        <line x1="0" x2={ancho} y1={base} y2={base} stroke="var(--serie-pista)" strokeWidth="1" />
        {grupos.map((g, i) => {
          const centro = i * paso + paso / 2;
          return (
            <g key={g.etiqueta}>
              {[
                { valor: g.anterior, x: centro - barra - 2, color: "var(--serie-otros)", opacidad: 0.55, nombre: etiquetaAnterior },
                { valor: g.actual, x: centro + 2, color: "var(--serie-1)", opacidad: 1, nombre: etiquetaActual },
              ].map((b) => {
                const h = maximo > 0 ? (b.valor / maximo) * util : 0;
                return (
                  <g key={b.nombre}>
                    <rect x={b.x} y={base - Math.max(h, b.valor > 0 ? 1 : 0)} width={barra} height={Math.max(h, b.valor > 0 ? 1 : 0)} rx="2" fill={b.color} opacity={b.opacidad} className="anim-barra">
                      <title>{`${g.etiqueta} · ${b.nombre}: ${money(b.valor)}`}</title>
                    </rect>
                    <text x={b.x + barra / 2} y={base - h - 5} textAnchor="middle" fontSize="11" className="fill-slate-600">
                      {b.valor > 0 ? importeCompacto(b.valor) : "—"}
                    </text>
                  </g>
                );
              })}
              <text x={centro} y={alto - 6} textAnchor="middle" fontSize="12" className="fill-slate-700">
                {g.etiqueta}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--serie-otros)", opacity: 0.55 }} />
          {etiquetaAnterior}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--serie-1)" }} />
          {etiquetaActual}
        </span>
      </figcaption>
    </figure>
  );
}
