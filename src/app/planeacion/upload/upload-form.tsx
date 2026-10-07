"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { describirCambios, type ImpactoPm } from "@/lib/planeacion/impacto-version";

// Mismo límite que la ruta /api/planeacion/upload.
const MAX_FILE_BYTES = 40 * 1024 * 1024;

interface FilaError {
  fila: number;
  mensaje: string;
}

// Un PM cargado: cada hoja del Excel con formato de PM es uno.
interface PedidoCargado {
  hoja: string;
  numero_pedido: string;
  pedido_id: string;
  numero_version: number;
  items_mo: number;
  items_fu: number;
}

interface UploadOk {
  ok: true;
  cargaId: string;
  pedidos: PedidoCargado[];
  // Hojas del archivo sin formato de PM (notas, cálculos): no se cargan.
  hojasIgnoradas?: string[];
  // Datos incompletos o dudosos que se guardaron igual (ver parser), y cambios
  // de proyecto o cliente de un PM que ya existía.
  avisos?: FilaError[];
}

interface UploadError {
  error: string;
  detalles?: FilaError[];
  cargaId?: string;
}

type UploadResult = UploadOk | UploadError;

// El servidor encontró un PM del archivo con trabajo en marcha (liberado,
// asignado, evaluado) y espera confirmación antes de cargar. El Excel sigue en
// Storage en `storagePath`.
interface RequiereConfirmacion {
  requiereConfirmacion: true;
  impactos: ImpactoPm[];
  storagePath: string;
}

// La persona decidió no cargar el archivo tras ver el aviso.
interface UploadOmitido {
  omitido: true;
}

function esError(r: UploadResult | UploadOmitido): r is UploadError {
  return "error" in r;
}

function esOmitido(r: UploadResult | UploadOmitido): r is UploadOmitido {
  return "omitido" in r;
}

function pideConfirmacion(r: UploadResult | RequiereConfirmacion): r is RequiereConfirmacion {
  return "requiereConfirmacion" in r;
}

interface Carga {
  id: string;
  file: File;
  estado: "pendiente" | "procesando" | "confirmando" | "terminado";
  // Solo mientras espera la confirmación.
  impactos?: ImpactoPm[];
  // 0-100: subida del archivo y procesamiento (ver PORCENTAJE_SUBIDA).
  progreso: number;
  fase?: "subiendo" | "procesando";
  resultado?: UploadResult | UploadOmitido;
}

function esExcel(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xlsm");
}

function formatoTamano(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Manda al servidor procesar un Excel que ya está en Storage. Con
// `confirmarImpacto` la persona ya vio el aviso de trabajo en marcha. Nunca
// lanza: los errores vuelven como UploadError.
async function procesarEnServidor(
  storagePath: string,
  nombreArchivo: string,
  confirmarImpacto = false
): Promise<UploadResult | RequiereConfirmacion> {
  try {
    const res = await fetch("/api/planeacion/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath, nombreArchivo, confirmarImpacto }),
    });
    const data: UploadResult | RequiereConfirmacion | null = await res.json().catch(() => null);
    if (res.status === 409 && data && pideConfirmacion(data)) return data;
    return (
      data ?? {
        error:
          res.status === 504
            ? "El archivo tardó demasiado en procesarse. Intenta de nuevo."
            : `El servidor respondió con un error (${res.status}).`,
      }
    );
  } catch {
    return { error: "Error de red al subir el archivo." };
  }
}

// Quita de Storage un archivo que esperaba confirmación y no se va a cargar.
async function descartarEntrante(storagePath: string, nombreArchivo: string): Promise<void> {
  try {
    await fetch("/api/planeacion/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath, nombreArchivo, descartar: true }),
    });
  } catch {
    // Si falla, a lo más queda un archivo suelto en "entrantes/".
  }
}

// La barra reparte el avance: subir el archivo ocupa hasta el 90 % y el resto
// es el procesamiento en el servidor, que no reporta avance (sube despacio
// hasta 99 % mientras responde).
const PORCENTAJE_SUBIDA = 90;

type AlProgresar = (porcentaje: number, fase: "subiendo" | "procesando") => void;

// PUT del archivo a la URL firmada de Storage midiendo los bytes enviados.
// Devuelve el mensaje de error, o null si salió bien.
function subirConAvance(url: string, file: File, onProgreso: AlProgresar): Promise<string | null> {
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgreso(Math.round((e.loaded / e.total) * PORCENTAJE_SUBIDA), "subiendo");
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolver(null);
      let mensaje = `error ${xhr.status}`;
      try {
        const cuerpo = JSON.parse(xhr.responseText);
        mensaje = cuerpo.message ?? cuerpo.error ?? mensaje;
      } catch {
        // La respuesta no era JSON: se queda el código de estado.
      }
      resolver(mensaje);
    };
    xhr.onerror = () => resolver("error de red");
    const cuerpo = new FormData();
    cuerpo.append("cacheControl", "3600");
    cuerpo.append("", file);
    onProgreso(0, "subiendo");
    xhr.send(cuerpo);
  });
}

// Sube un Excel y lo manda procesar. Nunca lanza: los errores vuelven como
// UploadError para mostrarse junto a su archivo.
async function subirArchivo(
  file: File,
  onProgreso: AlProgresar
): Promise<UploadResult | RequiereConfirmacion> {
  if (!esExcel(file.name)) {
    return { error: "Solo se aceptan archivos de Excel .xlsx o .xlsm." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: "El archivo excede el tamaño máximo permitido (40 MB)." };
  }

  try {
    // 1. El Excel va directo del navegador a Storage: Vercel no deja pasar
    //    peticiones de más de 4.5 MB, y los Excel con imágenes las pasan.
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
    }
    const conMacros = file.name.toLowerCase().endsWith(".xlsm");
    // El sufijo aleatorio evita choques si se suben dos en el mismo milisegundo.
    const storagePath = `${user.id}/entrantes/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${conMacros ? "xlsm" : "xlsx"}`;
    const bucket = supabase.storage.from("cargas-excel");
    // fetch no reporta el avance de la subida; XMLHttpRequest sí. Se usa una URL
    // firmada de Storage (mismos permisos que upload) para poder medirlo.
    const { data: firmada, error: firmaError } = await bucket.createSignedUploadUrl(storagePath);
    if (firmaError || !firmada) {
      return { error: `No se pudo subir el archivo: ${firmaError?.message ?? "sin respuesta"}` };
    }
    const subidaError = await subirConAvance(firmada.signedUrl, file, onProgreso);
    if (subidaError) {
      return { error: `No se pudo subir el archivo: ${subidaError}` };
    }

    // 2. El servidor lo toma de Storage y lo procesa (o pide confirmar antes).
    onProgreso(PORCENTAJE_SUBIDA, "procesando");
    return await procesarEnServidor(storagePath, file.name);
  } catch {
    return { error: "Error de red al subir el archivo." };
  }
}

export default function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Cuenta entradas/salidas de arrastre: dragleave también se dispara al
  // pasar sobre los elementos hijos de la zona.
  const profundidadArrastre = useRef(0);
  // Archivos que esperan que la persona confirme (por id de carga).
  const decisiones = useRef(new Map<string, (decision: "cargar" | "omitir") => void>());

  // Si se suelta un archivo fuera de la zona, el navegador lo abre o lo
  // descarga y se sale de la página: se evita en toda la ventana.
  useEffect(() => {
    const evitar = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", evitar);
    window.addEventListener("drop", evitar);
    return () => {
      window.removeEventListener("dragover", evitar);
      window.removeEventListener("drop", evitar);
    };
  }, []);

  function agregarArchivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const nuevas: Carga[] = Array.from(lista).map((file) => ({
      id: crypto.randomUUID(),
      file,
      estado: "pendiente",
      progreso: 0,
      // Los que no son Excel se marcan de una vez, sin intentar subirlos.
      ...(esExcel(file.name)
        ? {}
        : {
            estado: "terminado" as const,
            resultado: { error: "Solo se aceptan archivos de Excel .xlsx o .xlsm." },
          }),
    }));
    setCargas((prev) => [...prev, ...nuevas]);
  }

  function actualizar(id: string, cambios: Partial<Carga>) {
    setCargas((prev) => prev.map((c) => (c.id === id ? { ...c, ...cambios } : c)));
  }

  // Espera a que la persona decida qué hacer con un archivo que cambia un PM con
  // trabajo en marcha. El bucle de carga se detiene aquí; los demás archivos
  // esperan su turno.
  function esperarDecision(id: string): Promise<"cargar" | "omitir"> {
    return new Promise((resolver) => {
      decisiones.current.set(id, resolver);
    });
  }

  function decidir(id: string, decision: "cargar" | "omitir") {
    const resolver = decisiones.current.get(id);
    decisiones.current.delete(id);
    // Al decidir deja de estar "confirmando": el bucle sigue (cargar) o termina el archivo.
    actualizar(id, { estado: "procesando", impactos: undefined });
    resolver?.(decision);
  }

  async function subirPendientes() {
    const pendientes = cargas.filter((c) => c.estado === "pendiente");
    if (pendientes.length === 0) return;
    setEnviando(true);
    // Uno por uno: cada archivo ya sube muchas imágenes en paralelo, y dos
    // versiones del mismo PM deben quedar en el orden en que se eligieron.
    let conError = 0;
    let omitidos = 0;
    for (const carga of pendientes) {
      actualizar(carga.id, { estado: "procesando", progreso: 0, fase: "subiendo" });
      // Mientras el servidor procesa no hay avance real: la barra sigue
      // subiendo despacio sin llegar al 100 % hasta que responda. No avanza
      // mientras se espera la decisión de la persona (estado "confirmando").
      const avance = setInterval(() => {
        setCargas((prev) =>
          prev.map((c) =>
            c.id === carga.id && c.estado === "procesando" && c.fase === "procesando" && c.progreso < 99
              ? { ...c, progreso: c.progreso + 1 }
              : c
          )
        );
      }, 700);
      let resultado: UploadResult | UploadOmitido;
      try {
        const primero = await subirArchivo(carga.file, (progreso, fase) =>
          actualizar(carga.id, { progreso, fase })
        );
        if (pideConfirmacion(primero)) {
          // El PM ya tiene trabajo en marcha: se muestra qué deja atrás la versión
          // nueva y se espera la decisión.
          actualizar(carga.id, { estado: "confirmando", impactos: primero.impactos });
          const decision = await esperarDecision(carga.id);
          if (decision === "cargar") {
            const confirmado = await procesarEnServidor(primero.storagePath, carga.file.name, true);
            resultado = pideConfirmacion(confirmado)
              ? { error: "El servidor volvió a pedir confirmación; intenta de nuevo." }
              : confirmado;
          } else {
            await descartarEntrante(primero.storagePath, carga.file.name);
            resultado = { omitido: true };
          }
        } else {
          resultado = primero;
        }
      } finally {
        clearInterval(avance);
      }
      if (esOmitido(resultado)) omitidos++;
      else if (esError(resultado)) conError++;
      actualizar(carga.id, {
        estado: "terminado",
        resultado,
        progreso: esError(resultado) || esOmitido(resultado) ? 0 : 100,
      });
    }
    setEnviando(false);
    // Resumen breve: el detalle (PM, versiones, avisos) queda en cada archivo.
    const cargados = pendientes.length - conError - omitidos;
    if (conError === 0) {
      if (cargados > 0) avisar(cargados === 1 ? "Archivo cargado." : `${cargados} archivos cargados.`);
      else avisar("No se cargó ningún archivo.", "info");
    } else {
      avisar(
        cargados
          ? `${cargados} de ${pendientes.length} archivos cargados; revisa los que marcaron error.`
          : pendientes.length === 1
            ? "El archivo no se cargó; revisa el error."
            : "Ningún archivo se cargó; revisa los errores.",
        "error"
      );
    }
  }

  const pendientes = cargas.filter((c) => c.estado === "pendiente").length;
  const terminadas = cargas.filter((c) => c.estado === "terminado").length;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          profundidadArrastre.current++;
          setArrastrando(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          profundidadArrastre.current = Math.max(0, profundidadArrastre.current - 1);
          if (profundidadArrastre.current === 0) setArrastrando(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          profundidadArrastre.current = 0;
          setArrastrando(false);
          agregarArchivos(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          arrastrando
            ? "border-brand-600 bg-brand-50"
            : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className={`h-10 w-10 ${arrastrando ? "text-brand-600" : "text-slate-400"}`}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm font-medium text-slate-700">
          {arrastrando ? "Suelta los archivos aquí" : "Arrastra aquí uno o varios Excel"}
        </p>
        <p className="text-xs text-slate-500">
          o <span className="font-medium text-brand-700 underline">haz clic para elegirlos</span> ·
          .xlsx o .xlsm, hasta 40 MB cada uno
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm"
          multiple
          className="hidden"
          onChange={(e) => {
            agregarArchivos(e.target.files);
            // Permite volver a elegir el mismo archivo.
            e.target.value = "";
          }}
        />
      </div>

      {cargas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={subirPendientes}
            disabled={enviando || pendientes === 0}
            className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:opacity-50"
          >
            {enviando
              ? "Procesando..."
              : `Subir ${pendientes} archivo${pendientes === 1 ? "" : "s"}`}
          </button>
          {!enviando && terminadas > 0 && (
            <button
              type="button"
              onClick={() => setCargas((prev) => prev.filter((c) => c.estado !== "terminado"))}
              className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-brand-700 hover:underline"
            >
              Limpiar terminados
            </button>
          )}
        </div>
      )}

      {cargas.length > 0 && (
        <ul className="flex flex-col gap-3">
          {cargas.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900" title={c.file.name}>
                    {c.file.name}
                  </p>
                  <p className="text-xs text-slate-500">{formatoTamano(c.file.size)}</p>
                </div>
                <EstadoCarga carga={c} />
                {c.estado === "pendiente" && !enviando && (
                  <button
                    type="button"
                    onClick={() => setCargas((prev) => prev.filter((x) => x.id !== c.id))}
                    className="text-xs text-slate-400 hover:text-red-600"
                    aria-label={`Quitar ${c.file.name}`}
                  >
                    Quitar
                  </button>
                )}
              </div>
              {c.estado === "confirmando" && c.impactos && (
                <ConfirmarImpacto
                  impactos={c.impactos}
                  onCargar={() => decidir(c.id, "cargar")}
                  onOmitir={() => decidir(c.id, "omitir")}
                />
              )}
              {c.estado === "procesando" && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span>{c.fase === "procesando" ? "Procesando el pedido…" : "Subiendo archivo…"}</span>
                    <span className="font-medium tabular-nums">{c.progreso}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={c.progreso}
                    aria-label={`Progreso de ${c.file.name}`}
                    className="h-2 overflow-hidden rounded-full bg-slate-100"
                  >
                    <div
                      className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                      style={{ width: `${c.progreso}%` }}
                    />
                  </div>
                </div>
              )}
              {c.resultado && <ResultadoCarga resultado={c.resultado} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EstadoCarga({ carga }: { carga: Carga }) {
  const base = "ml-auto shrink-0 rounded px-2 py-0.5 text-xs font-medium";
  if (carga.estado === "pendiente") {
    return <span className={`${base} bg-slate-100 text-slate-600`}>En espera</span>;
  }
  if (carga.estado === "procesando") {
    return (
      <span className={`${base} animate-pulse bg-brand-50 text-brand-800`}>Procesando...</span>
    );
  }
  if (carga.estado === "confirmando") {
    return <span className={`${base} bg-amber-50 text-amber-800`}>Espera tu confirmación</span>;
  }
  if (carga.resultado && esOmitido(carga.resultado)) {
    return <span className={`${base} bg-slate-100 text-slate-600`}>Omitido</span>;
  }
  return carga.resultado && !esError(carga.resultado) ? (
    <span className={`${base} bg-green-50 text-green-700`}>Listo</span>
  ) : (
    <span className={`${base} bg-red-50 text-red-700`}>Error</span>
  );
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

// Aviso antes de cargar un Excel sobre un PM que ya tiene trabajo en marcha:
// la versión nueva empieza con todo pendiente y lo liberado, asignado y
// evaluado se queda en la versión anterior.
function ConfirmarImpacto({
  impactos,
  onCargar,
  onOmitir,
}: {
  impactos: ImpactoPm[];
  onCargar: () => void;
  onOmitir: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <p className="font-medium">
        {impactos.length === 1
          ? "Este PM ya tiene trabajo en marcha."
          : `${impactos.length} PM de este archivo ya tienen trabajo en marcha.`}
      </p>
      <ul className="mt-2 flex flex-col gap-3">
        {impactos.map((i) => {
          const m = i.enMarcha;
          const detalle = [
            m.itemsLiberados > 0 ? `${plural(m.itemsLiberados, "ítem liberado", "ítems liberados")} a Producción` : null,
            m.asignaciones > 0
              ? `${plural(m.asignaciones, "asignación", "asignaciones")}${
                  m.asignacionesConEntregas > 0 ? ` (${m.asignacionesConEntregas} con entregas)` : ""
                }`
              : null,
            m.itemsEvaluados > 0 ? `${plural(m.itemsEvaluados, "ítem evaluado", "ítems evaluados")} por Calidad` : null,
          ].filter(Boolean);
          return (
            <li key={`${i.hoja}-${i.numeroPedido}`}>
              <p className="font-medium">
                <span className="font-mono">{i.numeroPedido}</span> · v{i.versionActiva} → v{i.versionNueva}
                {impactos.length > 1 && <span className="font-normal text-amber-800"> · hoja “{i.hoja}”</span>}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                <li>
                  {i.igual
                    ? "El Excel es igual a la versión activa, pero cargarlo igual reinicia la liberación."
                    : `Cambios: ${describirCambios(i.cambios)}.`}
                </li>
                {i.mueblesLiberadosQueCambian + i.mueblesLiberadosQuitados > 0 && (
                  <li>
                    De los muebles ya liberados:{" "}
                    {[
                      i.mueblesLiberadosQueCambian > 0 ? `${i.mueblesLiberadosQueCambian} cambian` : null,
                      i.mueblesLiberadosQuitados > 0 ? `${i.mueblesLiberadosQuitados} se quitan` : null,
                    ]
                      .filter(Boolean)
                      .join(" y ")}
                    .
                  </li>
                )}
                {i.mueblesAsignadosQuitados > 0 && (
                  <li>
                    {plural(i.mueblesAsignadosQuitados, "mueble con asignaciones", "muebles con asignaciones")} ya no{" "}
                    {i.mueblesAsignadosQuitados === 1 ? "está" : "están"} en el Excel.
                  </li>
                )}
                <li>Hoy hay: {detalle.join(", ")}.</li>
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs">
        La versión nueva empieza con todo pendiente: hay que volver a liberarla y recibirá folios nuevos. Lo
        liberado, asignado y evaluado queda en la versión anterior.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCargar}
          className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
        >
          Cargar de todos modos
        </button>
        <button
          type="button"
          onClick={onOmitir}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
        >
          Omitir este archivo
        </button>
      </div>
    </div>
  );
}

function ResultadoCarga({ resultado }: { resultado: UploadResult | UploadOmitido }) {
  if (esOmitido(resultado)) {
    return (
      <p className="mt-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        No se cargó: lo omitiste. El PM sigue en su versión actual.
      </p>
    );
  }
  if (esError(resultado)) {
    return (
      <div className="mt-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
        <p className="font-medium">{resultado.error}</p>
        {resultado.detalles && resultado.detalles.length > 0 && (
          <ul className="mt-2 list-disc pl-5">
            {resultado.detalles.map((d, i) => (
              <li key={i}>
                {d.fila > 0 ? `Fila ${d.fila}: ` : ""}
                {d.mensaje}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mt-2 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
        <p className="font-medium">
          {resultado.pedidos.length === 1
            ? "Pedido ingerido correctamente."
            : `${resultado.pedidos.length} pedidos ingeridos correctamente (uno por hoja).`}
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {resultado.pedidos.map((p) => (
            <li key={p.pedido_id}>
              <Link href={`/planeacion/pedidos/${p.pedido_id}`} className="font-medium underline">
                {p.numero_pedido} →
              </Link>{" "}
              <span className="text-green-700">
                {resultado.pedidos.length > 1 && <>hoja &ldquo;{p.hoja}&rdquo; · </>}
                versión #{p.numero_version} · {p.items_mo} muebles (MO) y {p.items_fu} componentes
                (FU)
              </span>
              {p.numero_version > 1 && (
                <>
                  {" "}
                  <Link
                    href={`/planeacion/pedidos/${p.pedido_id}/cambios?a=${p.numero_version}`}
                    className="whitespace-nowrap font-medium underline"
                  >
                    Ver qué cambió vs v{p.numero_version - 1} →
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
        {resultado.hojasIgnoradas && resultado.hojasIgnoradas.length > 0 && (
          <p className="mt-2 text-xs text-green-700">
            Hojas sin formato de PM que no se cargaron:{" "}
            {resultado.hojasIgnoradas.map((h) => `“${h}”`).join(", ")}.
          </p>
        )}
      </div>
      {resultado.avisos && resultado.avisos.length > 0 && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">
            Se cargó, pero revisa estos avisos del Excel: datos incompletos o que causarán
            descuadres en los recibos ({resultado.avisos.length}):
          </p>
          <ul className="mt-2 list-disc pl-5">
            {resultado.avisos.map((d, i) => (
              <li key={i}>
                {d.fila > 0 ? `Fila ${d.fila}: ` : ""}
                {d.mensaje}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
