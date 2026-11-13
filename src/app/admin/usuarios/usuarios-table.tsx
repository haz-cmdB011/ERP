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
import { ESTILO_ROL } from "./estilo-rol";
import { ERROR_GENERICO, fetchJson } from "@/lib/http/fetch-json";
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
    const r = await fetchJson(`/api/admin/usuarios/${userId}/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setGuardando(false);
    if (!r.ok) {
      setMensaje({ tipo: "error", texto: r.error ?? ERROR_GENERICO });
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-brand-400 hover:bg-brand-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <circle cx="8" cy="15" r="4" />
          <path d="m10.8 12.2 9-9M17 6l3 3M14 9l2 2" />
        </svg>
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
          className="w-36 rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none"
        />
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-lg bg-brand-500 px-2.5 py-1 text-xs font-semibold text-on-brand disabled:opacity-50"
        >
          {guardando ? "..." : "Guardar"}
        </button>
        <button
          onClick={() => {
            setAbierto(false);
            setPassword("");
            setMensaje(null);
          }}
          className="text-xs text-gray-500 hover:text-black"
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
    const r = await fetchJson(`/api/admin/usuarios/${usuario.id}/rol`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        rol,
        area: mostrarArea ? area : null,
        areasMaquila: esMaquila ? areasMaquila : null,
      }),
    });
    setGuardando(false);
    if (!r.ok) {
      setError(r.error ?? ERROR_GENERICO);
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
    <tr className={`border-t border-slate-100 align-top transition-colors ${ESTILO_ROL[rol].fila}`}>
      <td className="py-3 pl-4 pr-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${ESTILO_ROL[rol].pastilla}`}
          >
            {(nombre.trim() || usuario.email || "?").charAt(0).toUpperCase()}
          </span>
          <input
            placeholder={esMaquila ? "Nombre del contratista" : "Nombre completo"}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-44 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-900 focus:border-brand-600 focus:outline-none disabled:bg-slate-50"
            disabled={esYo}
          />
        </div>
      </td>
      <td className="py-3 pr-4 text-slate-700">
        {usuario.email}
        {esYo && (
          <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-900">tú</span>
        )}
      </td>
      <td className="py-3 pr-4">
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value as PerfilRow["rol"])}
          className={`rounded-full border-0 px-3 py-1.5 text-sm font-semibold ${ESTILO_ROL[rol].pastilla}`}
          disabled={esYo}
        >
          {ROLES_VALIDOS.map((r) => (
            <option key={r} value={r}>
              {ROL_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-3 pr-4">
        {mostrarArea ? (
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as AreaValida)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
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
            <span className="text-xs text-slate-500">Estimaciones</span>
            <AreasMaquilaSelector
              valor={areasMaquila}
              onChange={setAreasMaquila}
              disabled={esYo}
            />
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="py-3 pr-4">
        {!esYo && cambios && (
          <button
            onClick={guardar}
            disabled={
              guardando || (esMaquila && (areasMaquila.length === 0 || !nombre.trim()))
            }
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
      <td className="py-3 pr-4">
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
          <span className="font-medium text-slate-700">Rol</span>
          <select
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
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
          <span className="font-medium text-slate-700">Área</span>
          <select
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
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
            className="text-sm text-slate-500 underline hover:text-slate-900"
          >
            Limpiar filtros
          </button>
        )}
        <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {visibles.length} de {usuarios.length} usuarios
        </span>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] overflow-hidden rounded-xl text-left text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <th className="py-3 pl-4 pr-4">Nombre</th>
            <th className="py-3 pr-4">Email</th>
            <th className="py-3 pr-4">Rol</th>
            <th className="py-3 pr-4">Área</th>
            <th className="py-3 pr-4"></th>
            <th className="py-3 pr-4">Contraseña</th>
          </tr>
        </thead>
        <tbody data-sin-barra>
          {visibles.map((u) => (
            <FilaUsuario key={u.id} usuario={u} esYo={u.id === miId} />
          ))}
          {visibles.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                Ningún usuario coincide con los filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
