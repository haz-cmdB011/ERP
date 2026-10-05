// Esqueleto que se muestra al instante mientras una pantalla del área carga
// (lo usan los loading.tsx de cada área): evita la sensación de que el clic
// no hizo nada.
export default function Cargando({ filas = 6 }: { filas?: number }) {
  const bloque = "esqueleto rounded-md";
  return (
    <main
      className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <div className={`${bloque} h-7 w-64`} />
        <div className={`${bloque} h-4 w-96 max-w-full`} />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-11 border-b border-slate-100 bg-slate-50" />
        {Array.from({ length: filas }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-4 last:border-0">
            <div className={`${bloque} h-4 w-20`} />
            <div className={`${bloque} h-4 flex-1`} />
            <div className={`${bloque} hidden h-4 w-28 sm:block`} />
            <div className={`${bloque} h-4 w-16`} />
          </div>
        ))}
      </div>
    </main>
  );
}
