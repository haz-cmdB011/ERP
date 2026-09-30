"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Mismo límite que la ruta /api/planeacion/upload.
const MAX_FILE_BYTES = 40 * 1024 * 1024;

interface FilaError {
  fila: number;
  mensaje: string;
}

interface UploadOk {
  ok: true;
  cargaId: string;
  pedido_id: string;
  pedido_version_id: string;
  numero_version: number;
  items_mo: number;
  items_fu: number;
  // Filas con datos incompletos que se guardaron igual (ver parser).
  avisos?: FilaError[];
}

interface UploadError {
  error: string;
  detalles?: FilaError[];
  cargaId?: string;
}

type UploadResult = UploadOk | UploadError;

function esError(r: UploadResult): r is UploadError {
  return "error" in r;
}

interface Carga {
  id: string;
  file: File;
  estado: "pendiente" | "procesando" | "terminado";
  resultado?: UploadResult;
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

// Sube un Excel y lo manda procesar. Nunca lanza: los errores vuelven como
// UploadError para mostrarse junto a su archivo.
async function subirArchivo(file: File): Promise<UploadResult> {
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
    const { error: subidaError } = await supabase.storage
      .from("cargas-excel")
      .upload(storagePath, file, {
        contentType: conMacros
          ? "application/vnd.ms-excel.sheet.macroEnabled.12"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });
    if (subidaError) {
      return { error: `No se pudo subir el archivo: ${subidaError.message}` };
    }

    // 2. El servidor lo toma de Storage y lo procesa.
    const res = await fetch("/api/planeacion/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath, nombreArchivo: file.name }),
    });
    const data: UploadResult | null = await res.json().catch(() => null);
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

export default function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Cuenta entradas/salidas de arrastre: dragleave también se dispara al
  // pasar sobre los elementos hijos de la zona.
  const profundidadArrastre = useRef(0);

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

  async function subirPendientes() {
    const pendientes = cargas.filter((c) => c.estado === "pendiente");
    if (pendientes.length === 0) return;
    setEnviando(true);
    // Uno por uno: cada archivo ya sube muchas imágenes en paralelo, y dos
    // versiones del mismo PM deben quedar en el orden en que se eligieron.
    for (const carga of pendientes) {
      actualizar(carga.id, { estado: "procesando" });
      const resultado = await subirArchivo(carga.file);
      actualizar(carga.id, { estado: "terminado", resultado });
    }
    setEnviando(false);
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
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
          arrastrando
            ? "border-indigo-400 bg-indigo-50"
            : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className={`h-10 w-10 ${arrastrando ? "text-indigo-500" : "text-slate-400"}`}
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
          o <span className="font-medium text-indigo-600 underline">haz clic para elegirlos</span> ·
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
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {enviando
              ? "Procesando..."
              : `Subir ${pendientes} archivo${pendientes === 1 ? "" : "s"}`}
          </button>
          {!enviando && terminadas > 0 && (
            <button
              type="button"
              onClick={() => setCargas((prev) => prev.filter((c) => c.estado !== "terminado"))}
              className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-indigo-600 hover:underline"
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
      <span className={`${base} animate-pulse bg-indigo-50 text-indigo-700`}>Procesando...</span>
    );
  }
  return carga.resultado && !esError(carga.resultado) ? (
    <span className={`${base} bg-green-50 text-green-700`}>Listo</span>
  ) : (
    <span className={`${base} bg-red-50 text-red-700`}>Error</span>
  );
}

function ResultadoCarga({ resultado }: { resultado: UploadResult }) {
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
          Pedido ingerido correctamente (versión #{resultado.numero_version}).
        </p>
        <p>
          {resultado.items_mo} muebles (MO) y {resultado.items_fu} componentes (FU) registrados.
        </p>
        <Link
          href={`/planeacion/pedidos/${resultado.pedido_id}`}
          className="mt-2 inline-block underline"
        >
          Ver pedido →
        </Link>
      </div>
      {resultado.avisos && resultado.avisos.length > 0 && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">
            Se cargó, pero revisa estos datos incompletos del Excel ({resultado.avisos.length}):
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
