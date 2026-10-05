import Link from "next/link";
import NumeroAnimado from "./numero-animado";

export interface TarjetaResumen {
  valor: number;
  etiqueta: string;
  // Texto corto que aclara qué se cuenta.
  detalle?: string;
  // Lista a la que lleva la tarjeta, ya filtrada.
  href?: string;
  // "atencion" resalta lo que alguien tiene que hacer; "suave" lo informativo.
  tono?: "atencion" | "suave";
}

// Fila de números al inicio de cada área: qué hay pendiente y un clic para
// verlo. Con valor 0 la tarjeta se apaga (no hay nada que hacer).
export default function ResumenInicio({ tarjetas }: { tarjetas: TarjetaResumen[] }) {
  if (tarjetas.length === 0) return null;
  return (
    <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tarjetas.map((t, i) => {
        const activa = t.valor > 0 && t.tono === "atencion";
        const cuerpo = (
          <>
            <span
              className={`text-3xl font-semibold tabular-nums tracking-tight ${
                activa ? "text-brand-800" : t.valor > 0 ? "text-slate-900" : "text-slate-400"
              }`}
            >
              <NumeroAnimado valor={t.valor} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900">{t.etiqueta}</span>
              {t.detalle && <span className="block text-xs text-slate-500">{t.detalle}</span>}
            </span>
          </>
        );
        const base = `anim-escala flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm ${
          activa ? "border-brand-300 ring-1 ring-brand-200" : "border-slate-200"
        }`;
        return t.href ? (
          <Link
            key={t.etiqueta}
            href={t.href}
            style={{ "--d": `${120 + i * 90}ms` } as React.CSSProperties}
            className={`${base} group transition duration-200 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md`}
          >
            {cuerpo}
          </Link>
        ) : (
          <div
            key={t.etiqueta}
            className={base}
            style={{ "--d": `${120 + i * 90}ms` } as React.CSSProperties}
          >
            {cuerpo}
          </div>
        );
      })}
    </section>
  );
}
