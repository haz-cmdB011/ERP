import Link from "next/link";
import LogoutButton from "./logout-button";

// Barra superior compartida entre las áreas de la app (Planeación,
// Producción...). Dos niveles separados a propósito: la fila de arriba es
// el selector de área (Planeación / Producción) + la sesión; la fila de
// abajo son los links propios de la área activa (pasados como children,
// ej. "Pedidos" / "Cargar Excel" dentro de Planeación) — así quedan
// visualmente subordinados al área en vez de verse como paneles hermanos
// al mismo nivel que Planeación/Producción.
export default function AreaNav({
  area,
  email,
  esDesarrollador = false,
  children,
}: {
  area: "planeacion" | "produccion" | "calidad" | "estimaciones" | "usuarios";
  email: string;
  // Usuarios es un panel más, pero solo para desarrolladores (acceso
  // global): las demás áreas no lo ven en su selector.
  esDesarrollador?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="print:hidden">
      <nav className="flex flex-wrap items-center gap-4 border-b border-gray-200 px-6 py-3 text-sm">
        <div className="flex items-center gap-1">
          <Link
            href="/planeacion"
            className={`rounded px-2 py-1 font-semibold ${
              area === "planeacion" ? "bg-black text-white" : "text-gray-600 hover:text-black"
            }`}
          >
            Planeación
          </Link>
          <Link
            href="/produccion"
            className={`rounded px-2 py-1 font-semibold ${
              area === "produccion" ? "bg-black text-white" : "text-gray-600 hover:text-black"
            }`}
          >
            Producción
          </Link>
          <Link
            href="/calidad"
            className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold ${
              area === "calidad" ? "bg-black text-white" : "text-gray-600 hover:text-black"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            Calidad
          </Link>
          <Link
            href="/estimaciones"
            className={`rounded px-2 py-1 font-semibold ${
              area === "estimaciones" ? "bg-black text-white" : "text-gray-600 hover:text-black"
            }`}
          >
            Estimaciones
          </Link>
          {esDesarrollador && (
            <Link
              href="/admin/usuarios"
              className={`rounded px-2 py-1 font-semibold ${
                area === "usuarios" ? "bg-black text-white" : "text-gray-600 hover:text-black"
              }`}
            >
              Usuarios
            </Link>
          )}
        </div>
        <Link href="/planeacion/cuenta" className="ml-auto text-gray-500 hover:text-black">
          {email}
        </Link>
        <LogoutButton />
      </nav>
      {children && (
        <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 bg-gray-50 px-6 py-2 text-sm">
          {children}
        </div>
      )}
    </div>
  );
}
