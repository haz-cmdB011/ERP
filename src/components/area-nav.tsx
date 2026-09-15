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
  children,
}: {
  area: "planeacion" | "produccion";
  email: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
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
