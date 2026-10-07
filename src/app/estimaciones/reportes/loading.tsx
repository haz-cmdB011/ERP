// Esqueleto mientras se lee el reporte semanal (varias consultas en paralelo).
export default function CargandoReporteSemanal() {
  return (
    <main
      className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6"
      aria-busy="true"
      aria-label="Cargando el reporte semanal"
    >
      <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      </div>
      <span className="sr-only">Cargando…</span>
    </main>
  );
}
