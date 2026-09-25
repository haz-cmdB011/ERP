import Link from "next/link";

export default function GeneradorRecibosPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Generador de Recibos
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tipos de recibo disponibles.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/estimaciones/recibos/acabados"
          className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
        >
          <h2 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600">
            Acabados
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Maquila de acabados: captura lo que propone el maquilador y compáralo contra el precio
            sugerido.
          </p>
        </Link>
        <Link
          href="/estimaciones/recibos/electrificacion"
          className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
        >
          <h2 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600">
            Electrificación
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Maquila de electrificación: modelo, metros de LED y kit de charolas, comparado contra el
            precio sugerido.
          </p>
        </Link>
      </div>
    </main>
  );
}
