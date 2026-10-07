// Esqueleto con la forma del pedido en Calidad: encabezado, filtros y tarjetas de ítems.
export default function Loading() {
  const bloque = "esqueleto rounded-md";
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <div className={`${bloque} h-7 w-48`} />
        <div className={`${bloque} h-4 w-72 max-w-full`} />
        <div className={`${bloque} h-3 w-32`} />
      </div>
      <div className="flex flex-wrap gap-2">
        {[24, 32, 40, 32, 32].map((w, i) => (
          <div key={i} className={`${bloque} h-8`} style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="h-9 border-b border-slate-100 bg-slate-50" />
          <div className="flex items-center gap-4 px-4 py-4">
            <div className={`${bloque} h-8 w-8`} />
            <div className={`${bloque} h-4 w-12`} />
            <div className={`${bloque} h-4 flex-1`} />
            <div className={`${bloque} h-5 w-28`} />
            <div className={`${bloque} h-8 w-16`} />
          </div>
        </div>
      ))}
    </main>
  );
}
