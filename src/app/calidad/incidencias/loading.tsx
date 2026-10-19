// Esqueleto con la forma de No conformidades: título, filtros, indicadores y gráficas.
export default function Loading() {
  const bloque = "esqueleto rounded-md";
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <div className={`${bloque} h-7 w-40`} />
        <div className={`${bloque} h-4 w-full max-w-xl`} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {[36, 44, 32, 52, 52].map((w, i) => (
          <div key={i} className={`${bloque} h-10`} style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${bloque} h-20`} />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${bloque} h-56`} />
        ))}
      </div>
    </main>
  );
}
