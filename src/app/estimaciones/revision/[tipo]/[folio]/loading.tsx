// Esqueleto con la forma de la revisión: encabezado del folio y tarjetas de renglones.
export default function Loading() {
  const bloque = "esqueleto rounded-md";
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <div className={`${bloque} h-3 w-32`} />
        <div className={`${bloque} h-7 w-48`} />
        <div className={`${bloque} h-4 w-96 max-w-full`} />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className={`${bloque} h-4 w-8`} />
            <div className={`${bloque} h-4 w-28`} />
            <div className={`${bloque} h-4 w-1/3`} />
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className="flex flex-col gap-2">
                <div className={`${bloque} h-3 w-32`} />
                <div className={`${bloque} h-8 w-28`} />
                <div className={`${bloque} h-3 w-40`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
