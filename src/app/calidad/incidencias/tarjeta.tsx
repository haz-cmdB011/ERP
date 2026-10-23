// Tarjeta de una sección del tablero. Con `desplegable` solo se ve el título
// hasta que se toca; sin él, el contenido va siempre a la vista.
export default function Tarjeta({
  titulo,
  descripcion,
  desplegable = false,
  abierto = false,
  plana = false,
  children,
}: {
  titulo: string;
  descripcion?: string;
  desplegable?: boolean;
  // Con `desplegable`: arranca abierta.
  abierto?: boolean;
  // Sin marco: para tarjetas dentro de otra tarjeta.
  plana?: boolean;
  children: React.ReactNode;
}) {
  const cabecera = (
    <div>
      <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
      {descripcion && <p className="text-xs font-normal text-slate-500">{descripcion}</p>}
    </div>
  );

  if (!desplegable) {
    if (plana) {
      return (
        <section className="flex flex-col gap-3">
          {cabecera}
          {children}
        </section>
      );
    }
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {cabecera}
        {children}
      </section>
    );
  }

  return (
    <details open={abierto} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-start gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block text-slate-500 transition-transform group-open:rotate-90">
          ▸
        </span>
        {cabecera}
      </summary>
      <div className="flex flex-col gap-3 border-t border-slate-200 p-4">{children}</div>
    </details>
  );
}
