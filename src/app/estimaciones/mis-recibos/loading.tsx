// Esqueleto con la forma de Mis recibos: título y la lista de recibos.
export default function Loading() {
  const bloque = "esqueleto rounded-md";
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <div className={`${bloque} h-7 w-44`} />
        <div className={`${bloque} h-4 w-80 max-w-full`} />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className={`${bloque} h-5 w-20`} />
              <div className={`${bloque} h-5 w-32`} />
            </div>
            <div className={`${bloque} mt-3 h-4 w-2/3`} />
            <div className={`${bloque} mt-2 h-4 w-1/3`} />
          </div>
        ))}
      </div>
    </main>
  );
}
