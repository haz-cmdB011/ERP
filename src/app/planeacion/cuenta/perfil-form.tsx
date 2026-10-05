"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Avatar from "@/components/avatar";
import { avisar } from "@/components/avisos";
import { NOMBRE_MAX, NOMBRE_MIN } from "@/lib/cuenta/nombre";

const LADO_SUBIDA = 512;

// Recorta la foto al centro en cuadrado y la reduce antes de subirla: una foto
// de celular pesa varios MB, y así viaja en unos cuantos KB. Si el navegador no
// puede crear WebP devuelve PNG; el servidor acepta ambos.
async function prepararFoto(archivo: File): Promise<Blob> {
  const bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  try {
    const lado = Math.min(bmp.width, bmp.height);
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = LADO_SUBIDA;
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("sin lienzo");
    ctx.drawImage(
      bmp,
      (bmp.width - lado) / 2,
      (bmp.height - lado) / 2,
      lado,
      lado,
      0,
      0,
      LADO_SUBIDA,
      LADO_SUBIDA
    );
    return await new Promise<Blob>((ok, fallo) =>
      lienzo.toBlob((b) => (b ? ok(b) : fallo(new Error("sin imagen"))), "image/webp", 0.85)
    );
  } finally {
    bmp.close();
  }
}

export default function PerfilForm({
  nombreInicial,
  email,
  avatarUrl,
}: {
  nombreInicial: string;
  email: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const selector = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState(nombreInicial);
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);

  const [previa, setPrevia] = useState<{ blob: Blob; url: string } | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);

  const inicial = (nombre.trim()[0] ?? email[0] ?? "?").toUpperCase();
  const nombreCambiado = nombre.trim() !== nombreInicial.trim();

  async function guardarNombre(e: React.FormEvent) {
    e.preventDefault();
    setErrorNombre(null);
    setGuardandoNombre(true);
    const res = await fetch("/api/cuenta/nombre", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    const datos = await res.json().catch(() => ({}));
    setGuardandoNombre(false);
    if (!res.ok) {
      setErrorNombre(datos.error ?? "No se pudo guardar el nombre.");
      return;
    }
    setNombre(datos.nombre);
    avisar("Nombre actualizado");
    router.refresh();
  }

  function descartarPrevia() {
    if (previa) URL.revokeObjectURL(previa.url);
    setPrevia(null);
  }

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite elegir la misma foto otra vez
    if (!archivo) return;
    setErrorFoto(null);
    if (!archivo.type.startsWith("image/")) {
      setErrorFoto("El archivo elegido no es una imagen.");
      return;
    }
    setProcesando(true);
    try {
      const blob = await prepararFoto(archivo);
      descartarPrevia();
      setPrevia({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setErrorFoto("No se pudo leer esa imagen. Prueba con otra (JPG, PNG o WebP).");
    }
    setProcesando(false);
  }

  async function subirFoto() {
    if (!previa) return;
    setErrorFoto(null);
    setProcesando(true);
    const datos = new FormData();
    datos.append("foto", new File([previa.blob], "foto.webp", { type: previa.blob.type }));
    const res = await fetch("/api/cuenta/foto", { method: "POST", body: datos });
    const cuerpo = await res.json().catch(() => ({}));
    setProcesando(false);
    if (!res.ok) {
      setErrorFoto(cuerpo.error ?? "No se pudo guardar la foto.");
      return;
    }
    descartarPrevia();
    avisar("Foto actualizada");
    router.refresh();
  }

  async function quitarFoto() {
    setErrorFoto(null);
    setProcesando(true);
    const res = await fetch("/api/cuenta/foto", { method: "DELETE" });
    const cuerpo = await res.json().catch(() => ({}));
    setProcesando(false);
    if (!res.ok) {
      setErrorFoto(cuerpo.error ?? "No se pudo quitar la foto.");
      return;
    }
    avisar("Foto quitada", "info");
    router.refresh();
  }

  const boton =
    "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Foto de perfil</h2>
        <div className="flex flex-wrap items-center gap-5">
          <Avatar
            url={previa?.url ?? avatarUrl}
            inicial={inicial}
            tamano="h-24 w-24"
            textoClase="text-4xl"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              ref={selector}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={alElegirArchivo}
              aria-label="Elegir una foto de este dispositivo"
            />
            {previa ? (
              <>
                <p className="text-sm text-slate-600">Así se verá tu foto. ¿La usamos?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={subirFoto}
                    disabled={procesando}
                    className={`${boton} bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}
                  >
                    {procesando ? "Guardando..." : "Usar esta foto"}
                  </button>
                  <button
                    type="button"
                    onClick={descartarPrevia}
                    disabled={procesando}
                    className={`${boton} border border-slate-300 text-slate-700 hover:bg-slate-50`}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Elige una imagen de tu computadora o de tu celular. Se recorta en círculo.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => selector.current?.click()}
                    disabled={procesando}
                    className={`${boton} bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}
                  >
                    {procesando ? "Preparando..." : avatarUrl ? "Cambiar foto" : "Subir una foto"}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={quitarFoto}
                      disabled={procesando}
                      className={`${boton} border border-slate-300 text-slate-700 hover:bg-slate-50`}
                    >
                      Quitar foto
                    </button>
                  )}
                </div>
              </>
            )}
            {errorFoto && (
              <p role="alert" className="text-sm text-red-700">
                {errorFoto}
              </p>
            )}
          </div>
        </div>
      </section>

      <form
        onSubmit={guardarNombre}
        className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-base font-semibold text-slate-900">Tu nombre</h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nombre" className="text-sm font-medium text-slate-700">
            Nombre que verán los demás
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            autoComplete="name"
            minLength={NOMBRE_MIN}
            maxLength={NOMBRE_MAX}
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <p className="text-xs text-slate-500">Correo de acceso: {email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={guardandoNombre || !nombreCambiado}
            className={`${boton} bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}
          >
            {guardandoNombre ? "Guardando..." : "Guardar nombre"}
          </button>
          {errorNombre && (
            <p role="alert" className="text-sm text-red-700">
              {errorNombre}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
