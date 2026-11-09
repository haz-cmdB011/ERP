"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/avisos";
import { PROCESO_LABELS, type Proceso } from "@/lib/produccion/asignaciones";
import type { LineaDespiece } from "@/lib/produccion/despiece";

// El "Pasa por" de una parte del despiece, desde el panel de asignación (el mismo dato que el
// editor del despiece: procesos_omitidos de la línea). Solo ofrece los procesos de la ruta del
// mueble. Guarda por la misma ruta que el editor (POST /api/produccion/despiece) con la versión
// que se acaba de leer, así que si alguien guardó antes no se pisa.
export default function PasaPorParte({
  itemId,
  parteId,
  procesos,
  omitidos,
  editable,
}: {
  itemId: string;
  parteId: string;
  // Los procesos que se pueden elegir (los de la ruta del mueble, sin repetir).
  procesos: Proceso[];
  omitidos: Proceso[];
  editable: boolean;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const pasa = procesos.filter((p) => !omitidos.includes(p));

  async function alternar(p: Proceso) {
    setGuardando(true);
    try {
      const r = await fetch(`/api/produccion/despiece?itemId=${encodeURIComponent(itemId)}`);
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error ?? "No se pudo leer el despiece.");
      if (!datos.puedeEditar || !datos.guardado) throw new Error("Este despiece no se puede cambiar.");
      const lineas = (datos.guardado.lineas as LineaDespiece[]).map((l) => {
        if (l.id !== parteId) return l;
        const actuales = l.procesos_omitidos ?? [];
        const nuevos = actuales.includes(p) ? actuales.filter((x) => x !== p) : [...actuales, p];
        return { ...l, procesos_omitidos: nuevos };
      });
      const form = new FormData();
      form.set("itemId", itemId);
      form.set("versionEsperada", String(datos.version));
      form.set("lineas", JSON.stringify(lineas));
      form.set("igualASugerencia", String(datos.guardado.igualASugerencia));
      form.set("claveEnvio", crypto.randomUUID());
      const g = await fetch("/api/produccion/despiece", { method: "POST", body: form });
      const res = await g.json();
      if (!g.ok) throw new Error(res.error ?? "No se pudo guardar.");
      avisar(res.aviso ? `Guardado. ${res.aviso}` : "Guardado.");
      router.refresh();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo guardar.", "error");
    } finally {
      setGuardando(false);
    }
  }

  if (procesos.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-slate-500">Pasa por</span>
      {procesos.map((p) => {
        const si = !omitidos.includes(p);
        // Debe pasar al menos por un proceso: el último marcado no se quita.
        const ultimo = si && pasa.length === 1;
        return (
          <button
            key={p}
            type="button"
            disabled={!editable || guardando || ultimo}
            onClick={() => alternar(p)}
            aria-pressed={si}
            className={`rounded-full border px-2 py-0.5 transition-colors ${
              si ? "border-slate-300 bg-white text-slate-800" : "border-dashed border-slate-300 text-slate-400 line-through"
            } ${editable && !ultimo ? "hover:border-sky-400" : "cursor-default"}`}
          >
            {PROCESO_LABELS[p]}
          </button>
        );
      })}
    </span>
  );
}
