import Link from "next/link";
import Marca from "@/components/marca";
import LogoutButton from "@/components/logout-button";

// Pantalla para quien abre un enlace a algo que su cuenta no puede ver. En lugar de moverlo en
// silencio a otra parte (que parecía que el enlace "no funcionaba"), se le dice por qué y se le
// ofrece ir a su inicio o entrar con otra cuenta.
export default function SinAcceso({
  titulo,
  mensaje,
  hrefInicio,
  etiquetaInicio,
}: {
  titulo: string;
  mensaje: string;
  hrefInicio: string;
  etiquetaInicio: string;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-nav px-6 text-center text-on-nav">
      <Marca sobreOscuro className="h-12 sm:h-14" />
      <div>
        <h1 className="text-xl font-semibold">{titulo}</h1>
        <p className="mt-2 max-w-sm text-sm text-on-nav-suave">{mensaje}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href={hrefInicio}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-500 px-5 text-sm font-semibold text-on-brand transition hover:bg-brand-400"
        >
          {etiquetaInicio}
        </Link>
        <div className="text-on-nav-suave">
          <LogoutButton etiqueta="Entrar con otra cuenta" />
        </div>
      </div>
    </main>
  );
}
