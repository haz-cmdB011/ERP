import Link from "next/link";

export interface PasoQueSigue {
  // Cuántos hay esperando ese paso: con 0 no se muestra.
  valor: number;
  // Lo que hay que hacer, en imperativo corto ("Liberar muebles").
  accion: string;
  // De qué se trata ("ítems en 3 O.T.").
  detalle: string;
  // A dónde lleva: directo a donde se hace ese paso.
  href: string;
  // Resaltado (lo urgente, como lo atrasado).
  urgente?: boolean;
}

// "Qué sigue": lo que está esperando a alguien en el área, con un atajo directo al lugar donde se
// resuelve. Sustituye a los números sueltos del menú: cada tarjeta dice qué hacer y lleva ahí.
// Sin nada pendiente muestra una sola línea de "todo al día".
export default function QueSigue({ pasos }: { pasos: PasoQueSigue[] }) {
  const pendientes = pasos.filter((p) => p.valor > 0);
  if (pendientes.length === 0) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
      >
        <span aria-hidden="true">✓</span> Todo al día: no hay nada esperando.
      </p>
    );
  }
  return (
    <section aria-label="Qué sigue" className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Qué sigue</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {pendientes.map((p) => (
          <li key={p.accion}>
            <Link
              href={p.href}
              className={`group flex h-full items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-brand-500 ${
                p.urgente ? "border-rose-200" : "border-slate-200"
              }`}
            >
              <span
                className={`min-w-9 text-right text-2xl font-semibold tabular-nums ${
                  p.urgente ? "text-rose-700" : "text-slate-900"
                }`}
              >
                {p.valor}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 group-hover:text-brand-700">
                  {p.accion}
                </span>
                <span className="block truncate text-xs text-slate-500">{p.detalle}</span>
              </span>
              <span aria-hidden="true" className="text-slate-400 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
