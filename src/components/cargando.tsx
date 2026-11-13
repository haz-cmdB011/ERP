// Esqueletos que se muestran al instante mientras una pantalla del área carga
// (los usan los loading.tsx de cada pestaña): evitan la sensación de que el clic no hizo nada.
// Cada pestaña tiene el suyo, con la forma de lo que va a aparecer (inicio, lista con buscador,
// tabla con filtros, secciones, detalle de un pedido...), para que al llegar el contenido real
// nada salte. `Cargando` (la forma por omisión) queda para pantallas sin una forma propia.

const bloque = "esqueleto rounded-md";

type Ancho = "4xl" | "5xl" | "6xl" | "7xl";

const ANCHOS: Record<Ancho, string> = {
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
};

// Marco común: la columna centrada de la pantalla, con el aviso para lectores de pantalla.
export function Pagina({
  ancho = "5xl",
  espacio = "gap-6",
  children,
}: {
  ancho?: Ancho;
  espacio?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className={`mx-auto flex ${ANCHOS[ancho]} flex-col ${espacio} p-4 sm:p-6`}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando…</span>
      {children}
    </main>
  );
}

// Título con su línea de descripción (y, si la pantalla lo trae, un botón a la derecha).
export function Encabezado({
  titulo = "w-64",
  detalle = "w-96",
  accion = false,
}: {
  titulo?: string;
  detalle?: string | null;
  accion?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
      <div className="flex flex-col gap-2">
        <div className={`${bloque} h-7 ${titulo}`} />
        {detalle && <div className={`${bloque} h-4 ${detalle} max-w-full`} />}
      </div>
      {accion && <div className={`${bloque} h-9 w-36`} />}
    </div>
  );
}

export function Buscador({ botones = 1 }: { botones?: number }) {
  return (
    <div className="flex gap-2">
      <div className={`${bloque} h-10 flex-1`} />
      {Array.from({ length: botones }).map((_, i) => (
        <div key={i} className={`${bloque} h-10 w-20`} />
      ))}
    </div>
  );
}

// Fila de filtros: campos con su etiqueta encima.
export function Filtros({ anchos = [56, 36, 36, 20] }: { anchos?: number[] }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {anchos.map((w, i) => (
        <div key={i} className={`${bloque} h-10 ${i === 0 ? "min-w-[14rem] flex-1" : ""}`} style={i === 0 ? undefined : { width: `${w * 4}px` }} />
      ))}
    </div>
  );
}

// Píldoras de filtro por estado (Todos, Activos, Terminados…).
export function Chips({ anchos = [24, 32, 28, 36] }: { anchos?: number[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {anchos.map((w, i) => (
        <div key={i} className={`${bloque} h-8 rounded-full`} style={{ width: `${w * 4}px` }} />
      ))}
    </div>
  );
}

export function Indicadores({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={`${bloque} h-20`} />
      ))}
    </div>
  );
}

export function Tabla({ filas = 6, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="h-11 border-b border-slate-100 bg-slate-50" />
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-4 last:border-0">
          <div className={`${bloque} h-4 w-20`} />
          <div className={`${bloque} h-4 flex-1`} />
          {columnas > 2 && <div className={`${bloque} hidden h-4 w-28 sm:block`} />}
          {columnas > 3 && <div className={`${bloque} h-4 w-16`} />}
          {columnas > 4 && <div className={`${bloque} hidden h-4 w-20 md:block`} />}
        </div>
      ))}
    </div>
  );
}

// Una tarjeta por elemento (las listas de Pedidos y de PM).
export function Tarjetas({ n = 5 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: Math.min(n, 5) }).map((_, i) => (
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
  );
}

// Tarjetas grandes con ícono (las de entrada de Estimaciones y del generador de recibos).
export function Atajos({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className={`${bloque} h-11 w-11 shrink-0`} />
          <div className="flex flex-1 flex-col gap-2">
            <div className={`${bloque} h-5 w-40 max-w-full`} />
            <div className={`${bloque} h-3 w-2/3`} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Recuadro con título y filas (las secciones del inicio y de los rechazos).
export function Seccion({ filas = 3, conAnillo = false }: { filas?: number; conAnillo?: boolean }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3">
        <div className={`${bloque} h-5 w-44`} />
        <div className={`${bloque} h-3 w-64 max-w-full`} />
      </div>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
          {conAnillo && <div className={`${bloque} h-9 w-9 shrink-0 rounded-full`} />}
          <div className="flex flex-1 flex-col gap-2">
            <div className={`${bloque} h-4 w-1/2`} />
            <div className={`${bloque} h-3 w-1/3`} />
          </div>
          <div className={`${bloque} h-3 w-20`} />
        </div>
      ))}
    </section>
  );
}

// Barras de avance en un recuadro (resumen de una O.T.).
export function Resumen({ barras = 3 }: { barras?: number }) {
  return (
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
      {Array.from({ length: barras }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className={`${bloque} h-3 w-24`} />
          <div className={`${bloque} h-2 w-full rounded-full`} />
        </div>
      ))}
    </div>
  );
}

// ---- Formas completas, una por tipo de pestaña ----

// Lista de pedidos o PM: título, buscador y tarjetas.
export function EsqueletoLista({
  ancho = "5xl",
  buscador = true,
  chips = false,
  accion = false,
  detalle = "w-96",
  tarjetas = 5,
}: {
  ancho?: Ancho;
  buscador?: boolean;
  chips?: boolean;
  accion?: boolean;
  detalle?: string | null;
  tarjetas?: number;
}) {
  return (
    <Pagina ancho={ancho}>
      <Encabezado titulo="w-40" detalle={detalle} accion={accion} />
      {buscador && <Buscador />}
      {chips && <Chips />}
      <Tarjetas n={tarjetas} />
    </Pagina>
  );
}

// Tabla con título, filtros opcionales y píldoras de estado.
export function EsqueletoTabla({
  ancho = "6xl",
  filtros = true,
  chips = false,
  filas = 8,
  columnas = 4,
  detalle = "w-96",
}: {
  ancho?: Ancho;
  filtros?: boolean;
  chips?: boolean;
  filas?: number;
  columnas?: number;
  detalle?: string | null;
}) {
  return (
    <Pagina ancho={ancho} espacio="gap-5">
      <Encabezado detalle={detalle} />
      {filtros && <Filtros />}
      {chips && <Chips anchos={[28, 40, 36, 28, 32]} />}
      <Tabla filas={filas} columnas={columnas} />
    </Pagina>
  );
}

// Pantallas armadas en recuadros con título (Inicio de Producción, Rechazos, Cancelados…).
export function EsqueletoSecciones({
  ancho = "5xl",
  secciones = 3,
  dosColumnas = false,
  carrusel = false,
  detalle = "w-80",
}: {
  ancho?: Ancho;
  secciones?: number;
  dosColumnas?: boolean;
  carrusel?: boolean;
  detalle?: string | null;
}) {
  const recuadros = Array.from({ length: secciones }).map((_, i) => <Seccion key={i} conAnillo={dosColumnas} />);
  return (
    <Pagina ancho={ancho}>
      <Encabezado detalle={detalle} />
      {carrusel && (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`${bloque} h-14 w-14 shrink-0 rounded-full`} />
                <div className="flex flex-1 flex-col gap-2">
                  <div className={`${bloque} h-4 w-2/3`} />
                  <div className={`${bloque} h-3 w-1/2`} />
                </div>
              </div>
              <div className={`${bloque} h-3 w-full`} />
              <div className={`${bloque} h-3 w-3/4`} />
            </div>
          ))}
        </div>
      )}
      {dosColumnas ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">{recuadros}</div>
      ) : (
        recuadros
      )}
    </Pagina>
  );
}

// Detalle de un pedido u O.T.: encabezado con migas, resumen y la tabla de muebles.
export function EsqueletoDetalle({
  ancho = "5xl",
  resumen = true,
  filas = 6,
}: {
  ancho?: Ancho;
  resumen?: boolean;
  filas?: number;
}) {
  return (
    <Pagina ancho={ancho}>
      <div className={`${bloque} h-4 w-56`} />
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <div className={`${bloque} h-7 w-48`} />
        <div className={`${bloque} h-4 w-72 max-w-full`} />
        <div className={`${bloque} h-3 w-32`} />
      </div>
      {resumen && <Resumen />}
      <Chips anchos={[24, 32, 40, 32]} />
      <Tabla filas={filas} columnas={5} />
    </Pagina>
  );
}

// Panel de asignación: filtros por estado, búsqueda y los grupos por cliente / O.T. plegados.
export function EsqueletoPanel() {
  return (
    <Pagina ancho="6xl" espacio="gap-5">
      <Encabezado detalle="w-full max-w-2xl" />
      <Chips anchos={[32, 40, 36, 24]} />
      <Filtros anchos={[56, 28, 20]} />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`${bloque} h-5 w-5 shrink-0`} />
            <div className="flex flex-1 flex-col gap-2">
              <div className={`${bloque} h-5 w-1/3`} />
              <div className={`${bloque} h-3 w-1/4`} />
            </div>
            <div className={`${bloque} hidden h-3 w-40 sm:block`} />
          </div>
        ))}
      </div>
    </Pagina>
  );
}

// Entrada de un área o del generador de recibos: título y tarjetas con ícono.
export function EsqueletoAtajos({ n = 4, ancho = "5xl" }: { n?: number; ancho?: Ancho }) {
  return (
    <Pagina ancho={ancho}>
      <Encabezado titulo="w-56" detalle={null} />
      <Atajos n={n} />
    </Pagina>
  );
}

// Formulario o ficha sencilla (cuenta, usuarios): título, campos y un botón.
export function EsqueletoFormulario({ ancho = "4xl" }: { ancho?: Ancho }) {
  return (
    <Pagina ancho={ancho}>
      <Encabezado titulo="w-44" detalle="w-80" />
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className={`${bloque} h-3 w-24`} />
            <div className={`${bloque} h-10 w-full`} />
          </div>
        ))}
        <div className={`${bloque} h-10 w-32`} />
      </div>
    </Pagina>
  );
}

// Forma por omisión: título y una tabla (o tarjetas) cuando la pantalla no tiene una propia.
export default function Cargando({
  filas = 6,
  forma = "tabla",
}: {
  filas?: number;
  forma?: "tabla" | "tarjetas";
}) {
  return (
    <Pagina>
      <Encabezado />
      {forma === "tarjetas" ? <Tarjetas n={filas} /> : <Tabla filas={filas} />}
    </Pagina>
  );
}
