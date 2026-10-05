// Foto de perfil redonda; sin foto, la inicial del nombre sobre el verde de la
// marca. `tamano` son las clases de ancho y alto (ej. "h-8 w-8").
export default function Avatar({
  url,
  inicial,
  tamano = "h-8 w-8",
  textoClase = "text-sm",
}: {
  url: string | null;
  inicial: string;
  tamano?: string;
  textoClase?: string;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, ya viene a 256 px
      <img
        src={url}
        alt=""
        className={`${tamano} shrink-0 rounded-full bg-brand-100 object-cover ring-2 ring-brand-500/70`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${tamano} ${textoClase} inline-flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-bold text-on-brand`}
    >
      {inicial}
    </span>
  );
}
