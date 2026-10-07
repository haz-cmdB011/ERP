// Esqueleto con la misma forma que la pantalla de carga: título, texto breve y
// zona para soltar archivos.
export default function Loading() {
  const bloque = "esqueleto rounded-md";
  return (
    <main
      className="mx-auto flex max-w-xl flex-col gap-6 p-4 sm:p-6"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2">
        <div className={`${bloque} h-7 w-56`} />
        <div className={`${bloque} h-4 w-full`} />
        <div className={`${bloque} h-4 w-2/3`} />
      </div>
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-6 py-10">
        <div className={`${bloque} h-10 w-10`} />
        <div className={`${bloque} h-4 w-48`} />
        <div className={`${bloque} h-3 w-64 max-w-full`} />
      </div>
    </main>
  );
}
