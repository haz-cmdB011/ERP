import Link from "next/link";
import Marca from "@/components/marca";

export default function NoEncontrada() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-nav px-6 text-center text-on-nav">
      <Marca sobreOscuro className="h-12 sm:h-14" />
      <p className="text-7xl font-light tracking-tight text-brand-500 sm:text-8xl">404</p>
      <div>
        <h1 className="text-xl font-semibold">No encontramos esta página</h1>
        <p className="mt-2 max-w-sm text-sm text-on-nav-suave">
          Puede que el enlace esté mal escrito o que el pedido ya no exista.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center rounded-lg bg-brand-500 px-5 text-sm font-semibold text-on-brand shadow-sm transition hover:bg-brand-400"
      >
        Ir al inicio
      </Link>
    </main>
  );
}
