"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { formatoFechaHora } from "@/lib/resumen/entrega";
import { enviarOGuardar, usuarioActualId } from "@/lib/offline/cola-navegador";
import {
  MATERIALES_SUGERIDOS,
  UNIDADES_SUGERIDAS,
  leerCantidad,
  limpiarLineas,
  mismasLineas,
  repartirPorcentajes,
  totalLinea,
  validarLineas,
  type LineaDespiece,
  type SugerenciaDespiece,
  type VersionHistorial,
} from "@/lib/produccion/despiece";
import {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
} from "@/app/produccion/asignaciones/modal";

interface Fila {
  clave: number;
  descripcion: string;
  material: string;
  unidad: string;
  piezas: string;
  hijoId: string | null;
  // La parte del despiece que es la línea (null si es nueva): con ella conserva sus asignaciones.
  parteId: string | null;
  aviso: string | null;
}

interface Borrador {
  // Versión del despiece sobre la que se hizo (0 = aún no había guardado).
  version: number;
  en: number;
  filas: Omit<Fila, "clave" | "aviso">[];
}

let ultimaClave = 0;

function filasDesde(lineas: LineaDespiece[], avisos: (string | null)[] = []): Fila[] {
  return lineas.map((l, i) => ({
    clave: ++ultimaClave,
    descripcion: l.descripcion,
    material: l.material ?? "",
    unidad: l.unidad ?? "",
    // 0 = el Excel no traía la cantidad: se deja en blanco para que se escriba.
    piezas: l.piezas_por_mueble > 0 ? String(l.piezas_por_mueble) : "",
    hijoId: l.hijo_id,
    parteId: l.id ?? null,
    aviso: avisos[i] ?? null,
  }));
}

// El % del mueble no se captura: cada línea vale lo mismo (partes iguales).
function lineasDesde(filas: Fila[]): LineaDespiece[] {
  const porcentajes = repartirPorcentajes(filas.length);
  return filas.map((f, i) => ({
    id: f.parteId ?? null,
    descripcion: f.descripcion,
    material: f.material || null,
    unidad: f.unidad || null,
    piezas_por_mueble: leerCantidad(f.piezas),
    porcentaje: porcentajes[i],
    hijo_id: f.hijoId,
  }));
}

function numero(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

const GRID = "sm:grid-cols-[minmax(0,1fr)_6rem_6rem_5.5rem_7rem_2.5rem]";

function claveBorrador(itemId: string): string {
  return `despiece-borrador-${itemId}`;
}

function leerBorrador(itemId: string): Borrador | null {
  try {
    const crudo = window.localStorage.getItem(claveBorrador(itemId));
    if (!crudo) return null;
    const b = JSON.parse(crudo) as Borrador;
    return Array.isArray(b.filas) && b.filas.length > 0 && typeof b.version === "number" ? b : null;
  } catch {
    return null;
  }
}

function guardarBorrador(itemId: string, b: Borrador) {
  try {
    window.localStorage.setItem(claveBorrador(itemId), JSON.stringify(b));
  } catch {
    // Sin almacenamiento (modo privado, lleno): el borrador es solo una comodidad.
  }
}

function borrarBorrador(itemId: string) {
  try {
    window.localStorage.removeItem(claveBorrador(itemId));
  } catch {
    // Igual que arriba.
  }
}

function Campo({
  etiqueta,
  className = "",
  children,
}: {
  etiqueta: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-slate-500">{etiqueta}</span>
      {children}
    </label>
  );
}

// Despiece del mueble: arranca con la sugerencia del sistema (hecha con los
// componentes del PM) o con lo que ya guardó Producción. El trabajador lo
// ajusta como le sirva y lo guarda; nada se guarda hasta que lo hace.
//
// Para que no se pierda ni se pise trabajo:
// - Guardar lleva la versión que se tenía abierta; si alguien guardó antes, la base
//   lo rechaza y aquí se avisa (también al volver a la pestaña).
// - Lo que se escribe queda como borrador en este aparato y se avisa al salir.
// - Sin red, el guardado se queda en la cola de envíos y sale solo.
// - Las líneas con ⚠ hay que marcarlas como revisadas antes de guardar.
export default function DespieceEditor({
  itemId,
  version,
  muebles,
  unidadMueble,
  sugerencia,
  guardado,
  historial,
  deVersionAnterior,
  cambiosPm,
  lineasCaidas,
  puedeEditar,
  motivoBloqueo,
  partesAsignadas = [],
}: {
  itemId: string;
  // Versión guardada del despiece (0 = todavía no hay).
  version: number;
  // Cantidad del mueble en el PM: el despiece es de UN mueble y se multiplica.
  muebles: number;
  unidadMueble: string | null;
  sugerencia: SugerenciaDespiece;
  guardado: { lineas: LineaDespiece[]; igualASugerencia: boolean; actualizadoEn: string } | null;
  historial: VersionHistorial[];
  deVersionAnterior: { lineas: LineaDespiece[]; guardadoEn: string } | null;
  // Qué cambió en el PM desde que se guardó el despiece.
  cambiosPm: string[];
  // Posiciones (en lo guardado) de las líneas cuyo componente ya no está vigente.
  lineasCaidas: number[];
  puedeEditar: boolean;
  motivoBloqueo: string | null;
  // Partes con asignaciones vigentes: no se pueden quitar (la base tampoco deja bajar
  // su cantidad por mueble).
  partesAsignadas?: string[];
}) {
  const router = useRouter();
  const [filas, setFilas] = useState<Fila[]>(() =>
    guardado ? filasDesde(guardado.lineas) : filasDesde(sugerencia.lineas, sugerencia.avisosPorLinea)
  );
  const [revisadas, setRevisadas] = useState<Set<number>>(new Set());
  const [entiendeCortada, setEntiendeCortada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState(false);
  const [enCola, setEnCola] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [hayVersionNueva, setHayVersionNueva] = useState(false);
  const claveDeEsteEnvio = useRef<string | null>(null);

  // Componentes caídos: sus hijo_id (para ofrecer desvincularlos).
  const [idsCaidos] = useState<Set<string>>(
    () => new Set(lineasCaidas.map((i) => guardado?.lineas[i]?.hijo_id).filter((x): x is string => !!x))
  );

  const actuales = lineasDesde(filas);
  const base = guardado ? guardado.lineas : sugerencia.lineas;
  const cambiado = !mismasLineas(actuales, base);
  const distintoDeLaSugerencia = !mismasLineas(actuales, sugerencia.lineas);
  const pendientesDeRevisar = filas.filter((f) => f.aviso && !revisadas.has(f.clave));

  // Borrador de un trabajo anterior sin guardar.
  useEffect(() => {
    if (!puedeEditar) return;
    const b = leerBorrador(itemId);
    if (!b) return;
    // Se ofrece solo si es distinto de lo que ya hay.
    const lineasBorrador = lineasDesde(b.filas.map((f) => ({ ...f, clave: 0, aviso: null })));
    if (mismasLineas(lineasBorrador, base)) {
      borrarBorrador(itemId);
      return;
    }
    // localStorage solo existe en el navegador: se lee tras montar y se muestra después.
    queueMicrotask(() => setBorrador(b));
    // Solo al abrir: `base` y `lineasDesde` no cambian mientras esta pantalla vive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, puedeEditar]);

  // Lo que se va escribiendo queda en este aparato.
  useEffect(() => {
    if (!puedeEditar || enCola) return;
    if (cambiado) {
      guardarBorrador(itemId, {
        version,
        en: Date.now(),
        filas: filas.map(({ descripcion, material, unidad, piezas, hijoId, parteId }) => ({
          descripcion,
          material,
          unidad,
          piezas,
          hijoId,
          parteId,
        })),
      });
    }
    // Si vuelve a quedar igual a lo guardado no se borra aquí: un borrador viejo aún
    // sin decidir se perdería en el primer render. El borrador se quita al guardar o
    // descartar, y al abrir se ignora el que sea igual a lo guardado.
  }, [filas, cambiado, itemId, version, puedeEditar, enCola]);

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    if (!puedeEditar || !cambiado || enCola) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [puedeEditar, cambiado, enCola]);

  // Al volver a la pestaña: ¿alguien guardó una versión más nueva?
  useEffect(() => {
    if (!puedeEditar) return;
    async function revisar() {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await createClient()
          .from("despieces_produccion")
          .select("version")
          .eq("planeacion_item_id", itemId)
          .maybeSingle<{ version: number }>();
        if ((data?.version ?? 0) > version) setHayVersionNueva(true);
      } catch {
        // Sin red: se vuelve a revisar al guardar.
      }
    }
    document.addEventListener("visibilitychange", revisar);
    window.addEventListener("focus", revisar);
    return () => {
      document.removeEventListener("visibilitychange", revisar);
      window.removeEventListener("focus", revisar);
    };
  }, [itemId, version, puedeEditar]);

  function cambiar(clave: number, campo: "descripcion" | "material" | "unidad" | "piezas", valor: string) {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)));
  }

  function agregar() {
    setFilas((prev) => [
      ...prev,
      { clave: ++ultimaClave, descripcion: "", material: "", unidad: "", piezas: "1", hijoId: null, parteId: null, aviso: null },
    ]);
  }

  function quitar(clave: number) {
    setFilas((prev) => (prev.length > 1 ? prev.filter((f) => f.clave !== clave) : prev));
  }

  function desvincular(clave: number) {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, hijoId: null } : f)));
  }

  function volverALaSugerencia() {
    setFilas(filasDesde(sugerencia.lineas, sugerencia.avisosPorLinea));
    setRevisadas(new Set());
    setError(null);
  }

  function cargarLineas(lineas: LineaDespiece[]) {
    setFilas(filasDesde(lineas));
    setRevisadas(new Set());
    setError(null);
  }

  function recuperarBorrador() {
    if (!borrador) return;
    // Los borradores de antes de las partes no traen parteId: la base reconoce la parte por su componente.
    setFilas(borrador.filas.map((f) => ({
        ...f,
        parteId: f.parteId ?? null,
        clave: ++ultimaClave,
        aviso: null,
      })));
    setBorrador(null);
  }

  function descartarBorrador() {
    borrarBorrador(itemId);
    setBorrador(null);
  }

  function marcarRevisada(clave: number, valor: boolean) {
    setRevisadas((prev) => {
      const nuevo = new Set(prev);
      if (valor) nuevo.add(clave);
      else nuevo.delete(clave);
      return nuevo;
    });
  }

  async function guardar() {
    const lineas = limpiarLineas(actuales);
    const problema = validarLineas(lineas);
    if (problema) {
      setError(problema);
      return;
    }
    if (pendientesDeRevisar.length > 0) {
      setError(
        `Hay ${pendientesDeRevisar.length} línea${pendientesDeRevisar.length === 1 ? "" : "s"} con ⚠ sin revisar: ajústalas y márcalas como revisadas.`
      );
      return;
    }
    if (!guardado && sugerencia.cortada && !entiendeCortada) {
      setError("La sugerencia quedó incompleta (demasiados componentes): confirma que lo sabes o agrega las líneas que faltan.");
      return;
    }
    setGuardando(true);
    setError(null);
    setConflicto(false);
    // La misma clave en los reintentos del mismo guardado: nunca se guarda dos veces.
    claveDeEsteEnvio.current ??= crypto.randomUUID();
    try {
      const resultado = await enviarOGuardar({
        id: claveDeEsteEnvio.current,
        etiqueta: `Despiece · ${lineas.length} línea${lineas.length === 1 ? "" : "s"}`,
        usuarioId: await usuarioActualId(),
        url: "/api/produccion/despiece",
        campos: {
          itemId,
          versionEsperada: String(version),
          lineas: JSON.stringify(lineas),
          igualASugerencia: String(mismasLineas(lineas, sugerencia.lineas)),
        },
        archivos: [],
        grupo: `despiece-${itemId}`,
      });
      if (resultado.estado === "rechazado") {
        claveDeEsteEnvio.current = null;
        setError(resultado.mensaje);
        setConflicto(/Alguien más guardó/.test(resultado.mensaje));
        return;
      }
      claveDeEsteEnvio.current = null;
      borrarBorrador(itemId);
      if (resultado.estado === "en-cola") {
        setEnCola(true);
        avisar("Sin conexión: el despiece quedó guardado en este aparato y se enviará solo.", "info");
        return;
      }
      avisar("Despiece guardado");
      router.refresh();
    } catch {
      setError("No se pudo guardar el despiece. Inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Despiece del mueble">
      {guardado ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            Despiece guardado el {formatoFechaHora(guardado.actualizadoEn)} · versión {version}
            {guardado.igualASugerencia ? " · igual a la sugerencia del sistema" : ""}
          </p>
          {cambiado && puedeEditar && <p className="mt-1 text-amber-700">Tienes cambios sin guardar.</p>}
        </div>
      ) : (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <p className="font-medium">Sugerencia del sistema</p>
          <p className="mt-1">
            Armada con los componentes de este mueble en el PM. Todavía no está guardada: úsala tal cual o
            ajústala como te sirva en el taller.
          </p>
        </div>
      )}

      {enCola && (
        <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          Tu guardado está en cola en este aparato y se enviará solo al volver la conexión. Mientras tanto no
          lo vuelvas a editar aquí; revisa el indicador de envíos pendientes.
        </p>
      )}

      {hayVersionNueva && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Alguien guardó una versión más reciente de este despiece.</p>
          <p className="mt-1">
            Si guardas ahora se rechazará. Tus cambios quedan como borrador en este aparato; carga la versión
            actual y recupéralos.
          </p>
          <button type="button" onClick={() => router.refresh()} className={`${estiloBotonSecundario} mt-2`}>
            Cargar la versión actual
          </button>
        </div>
      )}

      {borrador && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Hay un borrador sin guardar de este aparato</p>
          <p className="mt-1">
            Es del {formatoFechaHora(new Date(borrador.en).toISOString())}
            {borrador.version !== version
              ? ", hecho sobre otra versión del despiece: revísalo antes de guardarlo"
              : ""}
            .
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={recuperarBorrador} className={estiloBotonPrimario}>
              Recuperar el borrador
            </button>
            <button type="button" onClick={descartarBorrador} className={estiloBotonSecundario}>
              Descartarlo
            </button>
          </div>
        </div>
      )}

      {!guardado && deVersionAnterior && puedeEditar && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <p className="font-medium">Hay un despiece de una versión anterior del PM</p>
          <p className="mt-1">
            Se guardó el {formatoFechaHora(deVersionAnterior.guardadoEn)}. Puedes partir de él en vez de la
            sugerencia; revisa que siga valiendo con el PM actual.
          </p>
          <button
            type="button"
            onClick={() => cargarLineas(deVersionAnterior.lineas)}
            className={`${estiloBotonSecundario} mt-2`}
          >
            Usar el despiece anterior
          </button>
        </div>
      )}

      {cambiosPm.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">El PM cambió después de guardar este despiece</p>
          <ul className="mt-1 flex flex-col gap-1">
            {cambiosPm.map((c) => (
              <li key={c}>⚠ {c}</li>
            ))}
          </ul>
          <p className="mt-1">Revisa que el despiece siga correcto y guárdalo de nuevo para actualizar esta alerta.</p>
        </div>
      )}

      <p className="text-sm text-slate-600">
        Cada línea es lo que lleva <strong className="font-semibold">un</strong> mueble.
        {muebles > 0
          ? ` Con ${numero(muebles)}${unidadMueble ? ` ${unidadMueble}` : ""} en el PM, el total de cada línea se multiplica por ${numero(muebles)}.`
          : ""}
      </p>

      {sugerencia.avisos.length > 0 && !guardado && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {sugerencia.avisos.map((a) => (
            <li key={a}>⚠ {a}</li>
          ))}
          {sugerencia.cortada && puedeEditar && (
            <li>
              <label className="mt-1 flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={entiendeCortada}
                  onChange={(e) => setEntiendeCortada(e.target.checked)}
                  className="h-4 w-4"
                />
                Sé que la sugerencia está incompleta
              </label>
            </li>
          )}
        </ul>
      )}

      {motivoBloqueo && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{motivoBloqueo}</p>
      )}
      {!puedeEditar && !motivoBloqueo && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Solo Producción puede guardar el despiece; aquí lo puedes consultar.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {filas.map((f, i) => {
          const piezas = leerCantidad(f.piezas);
          const caido = !!f.hijoId && idsCaidos.has(f.hijoId);
          const asignada = !!f.parteId && partesAsignadas.includes(f.parteId);
          return (
            <div
              key={f.clave}
              className={`grid grid-cols-2 items-end gap-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0 ${GRID}`}
            >
              <Campo
                etiqueta={`Línea ${i + 1} · Descripción${asignada ? " · asignada a un equipo" : ""}`}
                className="col-span-full"
              >
                <input
                  value={f.descripcion}
                  onChange={(e) => cambiar(f.clave, "descripcion", e.target.value)}
                  readOnly={!puedeEditar}
                  maxLength={300}
                  className={estiloCampo}
                />
              </Campo>
              <Campo etiqueta="Material">
                <input
                  value={f.material}
                  onChange={(e) => cambiar(f.clave, "material", e.target.value)}
                  readOnly={!puedeEditar}
                  list="materiales-despiece"
                  maxLength={60}
                  className={estiloCampo}
                />
              </Campo>
              <Campo etiqueta="Unidad">
                <input
                  value={f.unidad}
                  onChange={(e) => cambiar(f.clave, "unidad", e.target.value)}
                  readOnly={!puedeEditar}
                  list="unidades-despiece"
                  maxLength={30}
                  className={estiloCampo}
                />
              </Campo>
              <Campo etiqueta="Por mueble">
                <input
                  value={f.piezas}
                  onChange={(e) => cambiar(f.clave, "piezas", e.target.value)}
                  readOnly={!puedeEditar}
                  inputMode="decimal"
                  className={`${estiloCampo} tabular-nums`}
                />
              </Campo>
              <div className="flex min-w-0 flex-col gap-1" title="Cada parte del despiece vale lo mismo">
                <span className="text-xs font-medium text-slate-500">% del mueble</span>
                <span className="py-2.5 text-base tabular-nums text-slate-900 sm:py-2 sm:text-sm">
                  {numero(actuales[i]?.porcentaje ?? 0)} %
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Para {numero(muebles)}</span>
                <span className="py-2.5 text-base tabular-nums text-slate-900 sm:py-2 sm:text-sm">
                  {Number.isFinite(piezas) ? numero(totalLinea(piezas, muebles)) : "—"}
                  {f.unidad ? ` ${f.unidad}` : ""}
                </span>
              </div>
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => quitar(f.clave)}
                  disabled={filas.length <= 1 || asignada}
                  aria-label={`Quitar la línea ${i + 1}`}
                  title={asignada ? "Ya está asignada a un equipo: no se puede quitar" : "Quitar la línea"}
                  className="flex h-11 w-11 items-center justify-center justify-self-end rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 sm:h-10 sm:w-10"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
              {f.aviso && (
                <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-700">
                  <p>⚠ {f.aviso}</p>
                  {puedeEditar && (
                    <label className="flex items-center gap-1.5 font-medium">
                      <input
                        type="checkbox"
                        checked={revisadas.has(f.clave)}
                        onChange={(e) => marcarRevisada(f.clave, e.target.checked)}
                        className="h-4 w-4"
                      />
                      Ya la revisé
                    </label>
                  )}
                </div>
              )}
              {caido && (
                <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-700">
                  <p>⚠ Su componente del PM ya no está vigente; no se puede guardar ligada a él.</p>
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => desvincular(f.clave)}
                      className="font-medium underline"
                    >
                      Desvincular del PM
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <datalist id="materiales-despiece">
          {MATERIALES_SUGERIDOS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <datalist id="unidades-despiece">
          {UNIDADES_SUGERIDAS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          {conflicto && (
            <button type="button" onClick={() => router.refresh()} className={`${estiloBotonSecundario} mt-2`}>
              Cargar la versión actual
            </button>
          )}
        </div>
      )}

      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={agregar} className={estiloBotonSecundario}>
            Agregar línea
          </button>
          {distintoDeLaSugerencia && (
            <button type="button" onClick={volverALaSugerencia} className={estiloBotonSecundario}>
              Volver a la sugerencia
            </button>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || enCola || (!!guardado && !cambiado)}
            className={`${estiloBotonPrimario} ml-auto`}
          >
            {guardando ? "Guardando…" : !guardado && !cambiado ? "Usar esta sugerencia" : "Guardar despiece"}
          </button>
        </div>
      )}

      {historial.length > 0 && (
        <details className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
          <summary className="cursor-pointer font-medium text-slate-900">
            Historial de guardados ({historial.length})
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-slate-100">
            {historial.map((h) => (
              <li key={h.version} className="flex flex-wrap items-center gap-2 py-2">
                <span>
                  Versión {h.version} · {formatoFechaHora(h.guardadoEn)} · {h.lineas.length} línea
                  {h.lineas.length === 1 ? "" : "s"}
                  {h.version === version ? " (actual)" : ""}
                </span>
                {puedeEditar && h.version !== version && (
                  <button
                    type="button"
                    onClick={() => cargarLineas(h.lineas)}
                    className="ml-auto font-medium text-sky-700 underline"
                  >
                    Cargar en el editor
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">
            Cargar una versión solo la pone en el editor; no se guarda hasta que pulses «Guardar despiece».
          </p>
        </details>
      )}
    </section>
  );
}
