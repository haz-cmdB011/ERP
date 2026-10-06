import Link from "next/link";

// Aviso para quien se registró solo (rol "usuario"): su cuenta existe, pero hasta
// que un administrador le asigne un rol y un área no puede ver los datos de la
// empresa (la base de datos lo impide; ver la migración lectura_solo_personal).
// Sin este aviso vería pantallas vacías sin saber por qué.
export default function CuentaPendiente() {
  return (
    <div
      role="status"
      className="mx-auto mt-4 flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-6 lg:mx-auto"
    >
      <span className="font-semibold">Tu cuenta está pendiente de aprobación.</span>
      <span className="text-amber-800">
        Un administrador debe asignarte un rol y un área para que puedas ver la información. Mientras
        tanto puedes cambiar tu nombre y tu foto.
      </span>
      <Link
        href="/planeacion/cuenta"
        className="font-medium underline underline-offset-2 hover:text-amber-950"
      >
        Ir a mi perfil
      </Link>
    </div>
  );
}
