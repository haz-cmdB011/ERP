// Esqueleto con la forma del Registro: título, buscador, filtros por estado y tabla.
export default function Loading() {
  const bloque = "esqueleto rounded-md";
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <div className={`${bloque} h-7 w-64`} />
        <div className={`${bloque} h-4 w-96 max-w-full`} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className={`${bloque} h-10 min-w-[14rem] flex-1`} />
        <div className={`${bloque} h-10 w-32`} />
        <div className={`${bloque} h-10 w-40`} />
        <div className={`${bloque} h-10 w-20`} />
      </div>
      <div className="flex flex-wrap gap-2">
        {[28, 40, 36, 28, 32].map((w, i) => (
          <div key={i} className={`${bloque} h-7`} style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-11 border-b border-slate-100 bg-slate-50" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-4 last:border-0">
            <div className={`${bloque} h-4 w-16`} />
            <div className={`${bloque} hidden h-4 w-24 sm:block`} />
            <div className={`${bloque} h-4 flex-1`} />
            <div className={`${bloque} h-5 w-28`} />
            <div className={`${bloque} hidden h-4 w-20 md:block`} />
          </div>
        ))}
      </div>
    </main>
  );
}
