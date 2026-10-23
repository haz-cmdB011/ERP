// Esqueleto que se muestra al instante mientras una pantalla del área carga
// (lo usan los loading.tsx de cada área): evita la sensación de que el clic
// no hizo nada. `forma="tarjetas"` dibuja una tarjeta por elemento (las listas de Pedidos y de
// PM de Planeación, Producción y Calidad); la tabla es la forma por omisión.
export default function Cargando({
  filas = 6,
  forma = "tabla",
}: {
  filas?: number;
  forma?: "tabla" | "tarjetas";
}) {
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
      {forma === "tarjetas" ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: Math.min(filas, 5) }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:min-h-[5.875rem] sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <div className="flex flex-1 flex-col gap-2">
                <div className={`${bloque} h-5 w-28`} />
                <div className={`${bloque} h-4 w-2/3 max-w-sm`} />
                <div className={`${bloque} h-3 w-24`} />
              </div>
              <div className="flex flex-col gap-2 sm:w-52">
                <div className={`${bloque} h-2 w-full rounded-full`} />
                <div className={`${bloque} h-3 w-28`} />
              </div>
            </div>
          ))}
        </div>
      ) : (
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
      )}
    </main>
  );
}
