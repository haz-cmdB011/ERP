import Link from "next/link";

// Pantalla vacía con un ícono y, si aplica, la acción que sigue. Sustituye a
// los recuadros de texto punteado: dice qué pasó y qué hacer. En el estilo
// Mobiliarium, sin ícono propio lleva el dibujo de una silla en trazo fino, como
// los de la hoja de planos.
export default function EstadoVacio({
  titulo,
  descripcion,
  accion,
  icono,
}: {
  titulo: string;
  descripcion?: string;
  accion?: { href: string; etiqueta: string };
  icono?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      <span
        className={`inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-800 ${
          icono ? "" : "mob:hidden"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
          aria-hidden="true"
        >
          {icono ?? (
            <>
              <path d="M21 8v13H3V8" />
              <path d="M1 3h22v5H1z" />
              <path d="M10 12h4" />
            </>
          )}
        </svg>
      </span>
      {!icono && <DibujoSilla className="hidden h-20 w-20 text-slate-400 mob:block" />}
      <div>
        <p className="text-base font-semibold text-slate-900 mob:font-serif mob:text-xl mob:font-medium">{titulo}</p>
        {descripcion && <p className="mt-1 max-w-md text-sm text-slate-500">{descripcion}</p>}
      </div>
      {accion && (
        <Link
          href={accion.href}
          className="mt-1 inline-flex min-h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-on-brand shadow-sm transition hover:bg-brand-400"
        >
          {accion.etiqueta}
        </Link>
      )}
    </div>
  );
}

// Silla de perfil con su cota, en trazo fino (mismo estilo que la hoja de planos
// del inicio de sesión).
function DibujoSilla({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M19 6l2 30M17 35h29v3H17zM21 38v18M43 38v18M21 49h22" />
      <path d="M17 61h29M17 59v4M46 59v4" strokeOpacity={0.6} />
    </svg>
  );
}
