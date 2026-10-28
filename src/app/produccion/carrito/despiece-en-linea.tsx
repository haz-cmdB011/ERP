"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import type { DatosDespiece } from "@/lib/produccion/despiece-db";
import DespieceEditor from "../pedidos/[id]/despiece/[itemId]/despiece-editor";

type Datos = DatosDespiece & { puedeEditar: boolean };

// El despiece de un mueble del carrito, desplegado debajo de su fila: el mismo editor de
// su página (arranca con los componentes del PM como sugerencia), con los datos pedidos a
// /api/produccion/despiece. Al guardar avisa al carrito, que lo pliega.
export default function DespieceEnLinea({
  itemId,
  alGuardar,
}: {
  itemId: string;
  alGuardar: () => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/produccion/despiece?itemId=${itemId}`);
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(cuerpo.error ?? "No se pudo leer el despiece.");
        return;
      }
      setError(null);
      setDatos(cuerpo as Datos);
    } catch {
      setError("Error de red al leer el despiece.");
    }
  }, [itemId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de datos al desplegar el mueble
    void cargar();
  }, [cargar]);

  if (error) {
    return <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>;
  }
  if (!datos) return <p className="text-sm text-slate-500">Cargando los componentes…</p>;
  return (
    // El editor lee ?volver= de la dirección: en una página estática necesita Suspense.
    <Suspense fallback={null}>
      <DespieceEditor
        // Al traer otra versión guardada se arma de nuevo.
        key={datos.version}
        {...datos}
        alGuardar={alGuardar}
        alRecargar={() => void cargar()}
      />
    </Suspense>
  );
}
