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
  area: "planeacion" | "produccion" | "calidad" | "usuarios";
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
            className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold ${
              area === "planeacion" ? "bg-black text-white" : "text-gray-600 hover:text-black"
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
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" />
              <path d="M9 12h6M9 16h6" />
            </svg>
            Planeación
          </Link>
          <Link
            href="/produccion"
            className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold ${
              area === "produccion" ? "bg-black text-white" : "text-gray-600 hover:text-black"
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
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.27 6.96 8.73 5.05 8.73-5.05" />
              <path d="M12 22.08V12" />
            </svg>
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
          {esDesarrollador && (
            <Link
              href="/admin/usuarios"
              className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold ${
                area === "usuarios" ? "bg-black text-white" : "text-gray-600 hover:text-black"
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
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
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
