// Esqueleto con la forma de Folios de calidad: título, filtros y tabla.
export default function Loading() {
  const bloque = "esqueleto rounded-md";
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <div className={`${bloque} h-7 w-56`} />
        <div className={`${bloque} h-4 w-full max-w-xl`} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className={`${bloque} h-10 min-w-[14rem] flex-1`} />
        <div className={`${bloque} h-10 w-36`} />
        <div className={`${bloque} h-10 w-36`} />
        <div className={`${bloque} h-10 w-28`} />
      </div>
      <div className="flex flex-wrap gap-2">
        {[24, 28, 32, 40].map((w, i) => (
          <div key={i} className={`${bloque} h-7`} style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-10 border-b border-slate-100 bg-slate-50" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-3 py-4 last:border-0">
            <div className={`${bloque} h-4 w-24`} />
            <div className={`${bloque} h-5 w-24`} />
            <div className={`${bloque} h-4 flex-1`} />
            <div className={`${bloque} hidden h-4 w-28 sm:block`} />
          </div>
        ))}
      </div>
    </main>
  );
}
