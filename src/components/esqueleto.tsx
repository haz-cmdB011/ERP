// Piezas para armar el esqueleto de carga de cada pantalla con su forma real (mismo ancho, mismos
// bloques y mismas proporciones), de modo que al llegar los datos nada salte de lugar. Cada
// loading.tsx las junta en el orden de su pantalla. El brillo que cruza es la clase .esqueleto
// (globals.css).

const BLOQUE = "esqueleto rounded-md";

export function Bloque({ className = "" }: { className?: string }) {
  return <div className={`${BLOQUE} ${className}`} />;
}

// <main> con el mismo ancho que la pantalla real y el aviso para lectores de pantalla.
export function PaginaEsqueleto({
  ancho = "max-w-5xl",
  children,
}: {
  ancho?: string;
  children: React.ReactNode;
}) {
  return (
    <main className={`mx-auto flex ${ancho} flex-col gap-5 p-4 sm:p-6`} aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      {children}
    </main>
  );
}

// Migas de pan ("Pedidos › O.T. › PM").
export function MigasEsqueleto({ tramos = 3 }: { tramos?: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: tramos }).map((_, i) => (
        <Bloque key={i} className="h-4 w-16" />
      ))}
    </div>
  );
}

// Título con su línea de ayuda, con o sin un botón a la derecha.
export function TituloEsqueleto({
  ayuda = true,
  derecha,
  ancho = "w-56",
}: {
  ayuda?: boolean;
  derecha?: React.ReactNode;
  ancho?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
      <div className="flex flex-col gap-2">
        <Bloque className={`h-8 ${ancho}`} />
        {ayuda && <Bloque className="h-4 w-80 max-w-full" />}
      </div>
      {derecha}
    </div>
  );
}

// Pestañas bajo una línea.
export function PestanasEsqueleto({ n = 2 }: { n?: number }) {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex min-h-11 items-center px-4">
          <Bloque className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

// Fila de tarjetas de números.
export function NumerosEsqueleto({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
          <Bloque className="h-9 w-9" />
          <div className="flex flex-1 flex-col gap-2">
            <Bloque className="h-4 w-24" />
            <Bloque className="h-3 w-32 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Cuadrícula de tarjetas (equipos, apartados...).
export function CuadriculaEsqueleto({
  n = 6,
  columnas = "sm:grid-cols-2 xl:grid-cols-3",
  alto = "h-36",
}: {
  n?: number;
  columnas?: string;
  alto?: string;
}) {
  return (
    <div className={`grid gap-4 ${columnas}`}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={`rounded-xl border border-slate-200 bg-white p-4 ${alto}`}>
          <div className="flex items-center gap-3">
            <Bloque className="h-9 w-9 rounded-full" />
            <Bloque className="h-5 w-40 max-w-full" />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Bloque className="h-4 w-24" />
            <Bloque className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Buscador con su botón de filtros (y, opcionalmente, otro botón).
export function BuscadorEsqueleto({ botones = 1, completo = false }: { botones?: number; completo?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Bloque className={`h-10 w-full flex-1 ${completo ? "" : "max-w-md"}`} />
      {Array.from({ length: botones }).map((_, i) => (
        <Bloque key={i} className="h-10 w-24" />
      ))}
    </div>
  );
}

// Tabla de muebles: casilla, miniatura, número, modelo con su descripción, cantidad, estado y acciones.
export function TablaMueblesEsqueleto({
  filas = 6,
  casilla = true,
  acciones = true,
}: {
  filas?: number;
  casilla?: boolean;
  acciones?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="h-10 border-b border-slate-200 bg-slate-50" />
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
          {casilla && <Bloque className="h-5 w-5 shrink-0" />}
          <Bloque className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" />
          <Bloque className="h-8 w-8 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Bloque className="h-5 w-40 max-w-full" />
            <Bloque className="h-3 w-2/3" />
          </div>
          <Bloque className="hidden h-5 w-16 sm:block" />
          <Bloque className="hidden h-6 w-24 rounded-full sm:block" />
          {acciones && (
            <div className="hidden gap-2 sm:flex">
              <Bloque className="h-8 w-8" />
              <Bloque className="h-8 w-8" />
              <Bloque className="h-8 w-8" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Tabla sencilla de filas (usuarios, listas).
export function FilasEsqueleto({ filas = 6, avatar = false }: { filas?: number; avatar?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="h-10 border-b border-slate-200 bg-slate-50" />
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-0">
          {avatar && <Bloque className="h-9 w-9 shrink-0 rounded-full" />}
          <Bloque className="h-8 w-40" />
          <Bloque className="hidden h-4 flex-1 sm:block" />
          <Bloque className="h-7 w-28 rounded-full" />
          <Bloque className="hidden h-8 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}

// Una fila de píldoras (filtros de año, estados, apartados).
export function ChipsEsqueleto({ n = 3, ancho = "w-24", alto = "h-9" }: { n?: number; ancho?: string; alto?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: n }).map((_, i) => (
        <Bloque key={i} className={`${alto} ${ancho} rounded-full`} />
      ))}
    </div>
  );
}

// Lista de pedidos por cliente: cada cliente es una fila plegada con su recuento.
export function ClientesEsqueleto({ n = 5 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
          <Bloque className="h-4 w-4" />
          <Bloque className="h-5 w-44 max-w-full" />
          <Bloque className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

// Tarjetas de acceso con ícono, título y una línea (inicio de Estimaciones, generador de recibos).
export function AccesosEsqueleto({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5">
          <Bloque className="h-10 w-10 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Bloque className="h-5 w-40 max-w-full" />
            <Bloque className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Tarjetas de PM de una O.T.: número, proyecto y barra de avance.
export function TarjetasPmEsqueleto({ n = 4 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:min-h-[5.875rem] sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <div className="flex flex-1 flex-col gap-2">
            <Bloque className="h-5 w-28" />
            <Bloque className="h-4 w-2/3 max-w-sm" />
            <Bloque className="h-3 w-24" />
          </div>
          <div className="flex flex-col gap-2 sm:w-52">
            <Bloque className="h-2 w-full rounded-full" />
            <Bloque className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Tabla con su encabezado: tantas columnas como se pidan (la primera más angosta, la segunda ancha).
export function TablaEsqueleto({ columnas = 5, filas = 6 }: { columnas?: number; filas?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex h-11 items-center gap-6 border-b border-slate-200 bg-slate-50 px-4">
        {Array.from({ length: columnas }).map((_, i) => (
          <Bloque key={i} className={`h-3 ${i === 1 ? "flex-1" : "w-16"}`} />
        ))}
      </div>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-slate-100 px-4 py-4 last:border-0">
          {Array.from({ length: columnas }).map((_, j) => (
            <Bloque key={j} className={`h-4 ${j === 1 ? "flex-1" : "w-16"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Lista de tarjetas con un título corto y dos líneas (rechazos, entregas, cancelados).
export function TarjetasListaEsqueleto({
  n = 4,
  columnas = "",
}: {
  n?: number;
  // Clases de cuadrícula (p. ej. "md:grid-cols-2"); vacío = una por renglón.
  columnas?: string;
}) {
  return (
    <div className={`grid gap-3 ${columnas}`}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <Bloque className="h-5 w-48 max-w-full" />
            <Bloque className="h-6 w-20 rounded-full" />
          </div>
          <Bloque className="h-4 w-2/3" />
          <Bloque className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

// Hoja o ficha grande (informe, recibo, viajero): título y una hoja en blanco.
export function HojaEsqueleto({ alto = "h-[30rem]" }: { alto?: string }) {
  return <Bloque className={`${alto} rounded-xl`} />;
}

// Formulario: un recuadro con campos apilados y su botón.
export function FormularioEsqueleto({ campos = 5 }: { campos?: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      {Array.from({ length: campos }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Bloque className="h-3 w-28" />
          <Bloque className="h-10 w-full" />
        </div>
      ))}
      <Bloque className="h-11 w-36" />
    </div>
  );
}
