import Link from "next/link";

export default function EstimacionesPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Estimaciones</h1>
        <p className="mt-1 text-sm text-slate-500">
          Paneles del área. Selecciona con qué quieres trabajar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/estimaciones/recibos"
          className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
        >
          <h2 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600">
            Generador de Recibos
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Captura los recibos de maquila y obtén el precio sugerido de cada pieza.
          </p>
        </Link>
        <Link
          href="/estimaciones/registro"
          className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
        >
          <h2 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600">
            Registro de recibos
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Consulta los recibos guardados, ordenados por folio, con sus totales y su ficha.
          </p>
        </Link>
      </div>
    </main>
  );
}
