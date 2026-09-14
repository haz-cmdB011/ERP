"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PerfilRow } from "./page";

const AREAS = ["produccion", "calidad", "estimaciones", "finanzas"] as const;

function FilaUsuario({ usuario, esYo }: { usuario: PerfilRow; esYo: boolean }) {
  const router = useRouter();
  const [rol, setRol] = useState(usuario.rol);
  const [area, setArea] = useState(usuario.area ?? "produccion");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/admin/usuarios/${usuario.id}/rol`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol, area: rol === "area" ? area : null }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "Error desconocido.");
      return;
    }
    router.refresh();
  }

  const cambios = rol !== usuario.rol || (rol === "area" && area !== usuario.area);

  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-4">
        {usuario.email}
        {esYo && <span className="ml-1 text-xs text-gray-400">(tú)</span>}
      </td>
      <td className="py-2 pr-4">
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value as PerfilRow["rol"])}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          disabled={esYo}
        >
          <option value="area">Área</option>
          <option value="planeacion">Planeación</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="py-2 pr-4">
        {rol === "area" ? (
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as typeof area)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            disabled={esYo}
          >
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 pr-4">
        {!esYo && cambios && (
          <button
            onClick={guardar}
            disabled={guardando}
            className="rounded bg-black px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

export default function UsuariosTable({
  usuarios,
  miId,
}: {
  usuarios: PerfilRow[];
  miId: string;
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-gray-500">
          <th className="py-2 pr-4">Email</th>
          <th className="py-2 pr-4">Rol</th>
          <th className="py-2 pr-4">Área</th>
          <th className="py-2 pr-4"></th>
        </tr>
      </thead>
      <tbody>
        {usuarios.map((u) => (
          <FilaUsuario key={u.id} usuario={u} esYo={u.id === miId} />
        ))}
      </tbody>
    </table>
  );
}
