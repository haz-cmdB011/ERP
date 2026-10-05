"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PerfilRow } from "./page";
import {
  AREAS_VALIDAS,
  AREA_LABELS,
  ROLES_VALIDOS,
  ROL_LABELS,
  requiereArea,
  requiereContratista,
  type AreaValida,
  type AreaMaquila,
} from "@/lib/auth/roles";
import AreasMaquilaSelector from "./areas-maquila-selector";
import { avisar } from "@/components/avisos";

function ResetPasswordCell({ userId }: { userId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function guardar() {
    if (password.length < 8) {
      setMensaje({ tipo: "error", texto: "Mínimo 8 caracteres." });
      return;
    }
    setGuardando(true);
    setMensaje(null);
    const res = await fetch(`/api/admin/usuarios/${userId}/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setMensaje({ tipo: "error", texto: data.error ?? "Error desconocido." });
      return;
    }
    avisar("Contraseña actualizada.");
    setPassword("");
    setAbierto(false);
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="text-xs text-gray-600 underline hover:text-black"
      >
        Restablecer contraseña
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input
          type="password"
          placeholder="Nueva contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-36 rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded bg-brand-500 px-2 py-1 text-xs font-medium text-on-brand disabled:opacity-50"
        >
          {guardando ? "..." : "Guardar"}
        </button>
        <button
          onClick={() => {
            setAbierto(false);
            setPassword("");
            setMensaje(null);
          }}
          className="text-xs text-gray-400 hover:text-black"
        >
          Cancelar
        </button>
      </div>
      {mensaje && (
        <p className={mensaje.tipo === "ok" ? "text-xs text-green-700" : "text-xs text-red-600"}>
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}

// Nombre que se muestra y edita. En el maquilador es su contratista (lo
// que se imprime en sus recibos).
function nombreDe(usuario: PerfilRow): string {
  return (usuario.rol === "maquilador" ? usuario.contratista : null) ?? usuario.nombre_completo ?? "";
}

function FilaUsuario({ usuario, esYo }: { usuario: PerfilRow; esYo: boolean }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombreDe(usuario));
  const [rol, setRol] = useState(usuario.rol);
  const [area, setArea] = useState<AreaValida>(usuario.area ?? "planeacion");
  const [areasMaquila, setAreasMaquila] = useState<AreaMaquila[]>(
    usuario.areas_maquila ?? ["acabados"]
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mostrarArea = requiereArea(rol);
  const esMaquila = requiereContratista(rol);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/admin/usuarios/${usuario.id}/rol`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        rol,
        area: mostrarArea ? area : null,
        areasMaquila: esMaquila ? areasMaquila : null,
      }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "Error desconocido.");
      return;
    }
    router.refresh();
  }

  const cambios =
    nombre.trim() !== nombreDe(usuario) ||
    rol !== usuario.rol ||
    (mostrarArea && area !== usuario.area) ||
    (esMaquila && areasMaquila.join(",") !== (usuario.areas_maquila ?? []).join(","));

  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="py-2 pr-4">
        <input
          placeholder={esMaquila ? "Nombre del contratista" : "Nombre completo"}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-44 rounded border border-gray-300 px-2 py-1 text-sm"
          disabled={esYo}
        />
      </td>
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
          {ROLES_VALIDOS.map((r) => (
            <option key={r} value={r}>
              {ROL_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-4">
        {mostrarArea ? (
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as AreaValida)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            disabled={esYo}
          >
            {AREAS_VALIDAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABELS[a]}
              </option>
            ))}
          </select>
        ) : esMaquila ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Estimaciones</span>
            <AreasMaquilaSelector
              valor={areasMaquila}
              onChange={setAreasMaquila}
              disabled={esYo}
            />
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 pr-4">
        {!esYo && cambios && (
          <button
            onClick={guardar}
            disabled={
              guardando || (esMaquila && (areasMaquila.length === 0 || !nombre.trim()))
            }
            className="rounded bg-brand-500 px-2 py-1 text-xs font-medium text-on-brand disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
      <td className="py-2 pr-4">
        <ResetPasswordCell userId={usuario.id} />
      </td>
    </tr>
  );
}

const SIN_AREA = "sin-area";

export default function UsuariosTable({
  usuarios,
  miId,
}: {
  usuarios: PerfilRow[];
  miId: string;
}) {
  const [filtroRol, setFiltroRol] = useState("");
  const [filtroArea, setFiltroArea] = useState("");

  const visibles = usuarios.filter(
    (u) =>
      (!filtroRol || u.rol === filtroRol) &&
      (!filtroArea || (filtroArea === SIN_AREA ? !u.area : u.area === filtroArea))
  );

  return (
    // panel-vidrio: sin efecto en el estilo clásico; en el de vidrio la tabla
    // va en un panel difuminado (vidrio.css).
    <div className="panel-vidrio flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-gray-500">Rol</span>
          <select
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            {ROLES_VALIDOS.map((r) => (
              <option key={r} value={r}>
                {ROL_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-gray-500">Área</span>
          <select
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">Todas</option>
            {AREAS_VALIDAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABELS[a]}
              </option>
            ))}
            <option value={SIN_AREA}>Sin área</option>
          </select>
        </label>
        {(filtroRol || filtroArea) && (
          <button
            type="button"
            onClick={() => {
              setFiltroRol("");
              setFiltroArea("");
            }}
            className="text-xs text-gray-500 underline hover:text-black"
          >
            Limpiar filtros
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500">
          {visibles.length} de {usuarios.length} usuarios
        </span>
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-gray-500">
            <th className="py-2 pr-4">Nombre</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Rol</th>
            <th className="py-2 pr-4">Área</th>
            <th className="py-2 pr-4"></th>
            <th className="py-2 pr-4">Contraseña</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((u) => (
            <FilaUsuario key={u.id} usuario={u} esYo={u.id === miId} />
          ))}
          {visibles.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-sm text-gray-500">
                Ningún usuario coincide con los filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
