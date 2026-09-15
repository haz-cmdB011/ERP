import Link from "next/link";
import LogoutButton from "./logout-button";

// Barra superior compartida entre las áreas de la app (Planeación,
// Producción...): tabs de área + los links propios de cada área (pasados
// como children) + sesión. Una sola fuente para no desincronizar el look
// del selector de área entre layouts.
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
      {children}
      <Link href="/planeacion/cuenta" className="ml-auto text-gray-500 hover:text-black">
        {email}
      </Link>
      <LogoutButton />
    </nav>
  );
}
