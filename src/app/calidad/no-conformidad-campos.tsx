"use client";

import { useEffect, useMemo, useState } from "react";
import SelectorMotivo from "@/app/calidad/selector-motivo";
import { estiloCampo, estiloEtiqueta } from "@/app/produccion/asignaciones/modal";
import { cargarCatalogosCalidad } from "@/lib/calidad/catalogos-calidad";
import { motivosMasUsados } from "@/lib/calidad/motivos";
import {
  CAUSAS_RAIZ,
  MAX_FOTOS_INFORME,
  SEVERIDADES,
  TIPOS_REPORTE,
  TIPO_PROBLEMA_LABELS,
  nombresDeAreas,
  responsablesDeArea,
  type CatalogosCalidad,
  type DetalleNoConformidad,
} from "@/lib/calidad/no-conformidad";
import { createClient } from "@/lib/supabase/client";

// Responsable de un área: lista del catálogo si la hay; si el área no tiene
// responsable fijo (cliente, obras, maquilador…), se escribe.
function SelectorResponsable({
  etiqueta,
  area,
  valor,
  onCambio,
  areas,
}: {
  etiqueta: string;
  area: string;
  valor: string;
  onCambio: (v: string) => void;
  areas: CatalogosCalidad["areas"];
}) {
  const responsables = area ? responsablesDeArea(areas, area) : [];
  return (
    <label className={estiloEtiqueta}>
      {etiqueta}
      {responsables.length > 0 ? (
        <select value={valor} onChange={(e) => onCambio(e.target.value)} className={estiloCampo}>
          <option value="">Elegir…</option>
          {/* Un nombre guardado que ya no está en la lista se conserva. */}
          {valor && !responsables.includes(valor) && <option value={valor}>{valor}</option>}
          {responsables.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      ) : (
        <input
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          maxLength={120}
          disabled={!area}
          placeholder={area ? "Esta área no tiene responsable fijo: escribe el nombre" : "Elige primero el área"}
          className={estiloCampo}
        />
      )}
    </label>
  );
}

// Formulario completo del informe de no conformidad, para completarlo o
// corregirlo después desde el informe (la captura inicial va por el asistente,
// ver asistente-no-conformidad.tsx). Los catálogos (motivos, áreas con
// responsables, autorizadores) se leen de la base.
export default function NoConformidadCampos({
  valor,
  onCambio,
  fotos,
  onFotos,
  pedirPiezas = false,
  fotosExistentes = 0,
}: {
  valor: DetalleNoConformidad;
  onCambio: (v: DetalleNoConformidad) => void;
  fotos: File[];
  onFotos: (f: File[]) => void;
  // Un informe sin lote (componente) debe decir cuántas piezas están afectadas.
  pedirPiezas?: boolean;
  fotosExistentes?: number;
}) {
  const [catalogos, setCatalogos] = useState<CatalogosCalidad | null>(null);
  const [errorCatalogos, setErrorCatalogos] = useState<string | null>(null);
  const [codigosRecientes, setCodigosRecientes] = useState<(string | null)[]>([]);
  const [cambiandoMotivo, setCambiandoMotivo] = useState(false);

  useEffect(() => {
    let vivo = true;
    cargarCatalogosCalidad().then(
      (c) => vivo && setCatalogos(c),
      (e: Error) => vivo && setErrorCatalogos(e.message)
    );
    createClient()
      .from("informes_calidad")
      .select("motivo_codigo")
      .not("motivo_codigo", "is", null)
      .order("elaborado_en", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (vivo) setCodigosRecientes(((data ?? []) as { motivo_codigo: string | null }[]).map((r) => r.motivo_codigo));
      });
    return () => {
      vivo = false;
    };
  }, []);

  const motivoActual = catalogos?.motivos.find((m) => m.codigo === valor.motivoCodigo) ?? null;
  const masUsados = useMemo(
    () =>
      catalogos
        ? motivosMasUsados(codigosRecientes)
            .map((c) => catalogos.motivos.find((m) => m.codigo === c))
            .filter((m): m is NonNullable<typeof m> => !!m)
        : [],
    [catalogos, codigosRecientes]
  );
  const areas = catalogos ? nombresDeAreas(catalogos.areas) : [];
  const cupo = MAX_FOTOS_INFORME - fotosExistentes;

  const set = (k: keyof DetalleNoConformidad) => (e: { target: { value: string } }) =>
    onCambio({ ...valor, [k]: e.target.value });

  if (errorCatalogos) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
        No se pudieron cargar los catálogos de Calidad: {errorCatalogos}
      </p>
    );
  }

  const selectorArea = (campo: "areaDeteccion" | "areaOrigen", responsable: "responsableDeteccion" | "responsableOrigen") => (
    <select
      value={valor[campo]}
      onChange={(e) => {
        const unico = catalogos ? responsablesDeArea(catalogos.areas, e.target.value) : [];
        onCambio({ ...valor, [campo]: e.target.value, [responsable]: unico.length === 1 ? unico[0] : "" });
      }}
      className={estiloCampo}
    >
      <option value="">Elegir…</option>
      {areas.map((a) => (
        <option key={a} value={a}>{a}</option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Motivo</span>
        {motivoActual && !cambiandoMotivo ? (
          <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                {motivoActual.codigo} · {TIPO_PROBLEMA_LABELS[motivoActual.tipo]}
              </p>
              <button type="button" onClick={() => setCambiandoMotivo(true)} className="min-h-9 px-2 text-sm font-medium text-brand-700">
                Cambiar
              </button>
            </div>
            <p className="mt-1 text-base font-semibold text-slate-900">{motivoActual.nombre}</p>
          </div>
        ) : catalogos ? (
          <SelectorMotivo
            motivos={catalogos.motivos}
            masUsados={masUsados}
            onElegir={(m) => {
              onCambio({ ...valor, motivoCodigo: m.codigo });
              setCambiandoMotivo(false);
            }}
          />
        ) : (
          <p className="text-sm text-slate-500">Cargando motivos…</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Tipo de reporte</span>
        <div className="flex flex-wrap gap-2">
          {TIPOS_REPORTE.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={valor.tipoReporte === t}
              onClick={() => onCambio({ ...valor, tipoReporte: t })}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                valor.tipoReporte === t ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-300 text-slate-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dónde se detectó</legend>
        <label className={estiloEtiqueta}>
          Área donde se detectó
          {selectorArea("areaDeteccion", "responsableDeteccion")}
        </label>
        <SelectorResponsable
          etiqueta="Responsable de la no conformidad"
          area={valor.areaDeteccion}
          valor={valor.responsableDeteccion}
          onCambio={(v) => onCambio({ ...valor, responsableDeteccion: v })}
          areas={catalogos?.areas ?? []}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">De dónde viene</legend>
        <label className={estiloEtiqueta}>
          Área origen de la no conformidad
          {selectorArea("areaOrigen", "responsableOrigen")}
        </label>
        <SelectorResponsable
          etiqueta="Responsable en el área de origen"
          area={valor.areaOrigen}
          valor={valor.responsableOrigen}
          onCambio={(v) => onCambio({ ...valor, responsableOrigen: v })}
          areas={catalogos?.areas ?? []}
        />
      </fieldset>

      <label className={estiloEtiqueta}>
        Piezas afectadas{pedirPiezas ? "" : " (opcional)"}
        <input inputMode="decimal" value={valor.piezasAfectadas} onChange={set("piezasAfectadas")} className={estiloCampo} />
      </label>
      <label className={estiloEtiqueta}>
        Acciones correctivas
        <textarea rows={3} maxLength={1000} value={valor.accionesCorrectivas} onChange={set("accionesCorrectivas")} className={estiloCampo} />
      </label>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Solución y cierre</legend>
        <label className={estiloEtiqueta}>
          Descripción de la solución
          <textarea rows={3} maxLength={1000} value={valor.solucion} onChange={set("solucion")} className={estiloCampo} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={estiloEtiqueta}>
            Material
            <input value={valor.material} onChange={set("material")} maxLength={500} className={estiloCampo} />
          </label>
          <label className={estiloEtiqueta}>
            Mano de obra
            <input value={valor.manoObra} onChange={set("manoObra")} maxLength={500} className={estiloCampo} />
          </label>
        </div>
        <label className={estiloEtiqueta}>
          Autoriza
          <select value={valor.autoriza} onChange={set("autoriza")} className={estiloCampo}>
            <option value="">Sin autorizar</option>
            {catalogos?.autorizadores.map((a) => (
              <option key={a.nombre} value={a.nombre}>
                {a.nombre} — {a.puesto}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Severidad</span>
          <div className="flex gap-2">
            {SEVERIDADES.map((s) => (
              <button
                key={s.valor}
                type="button"
                aria-pressed={valor.severidad === s.valor}
                onClick={() => onCambio({ ...valor, severidad: valor.severidad === s.valor ? "" : s.valor })}
                className={`min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium ${
                  valor.severidad === s.valor ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-300 text-slate-600"
                }`}
              >
                {s.nombre}
              </button>
            ))}
          </div>
        </div>
        <label className={estiloEtiqueta}>
          Análisis de causa raíz
          <select value={valor.causaRaizTipo} onChange={set("causaRaizTipo")} className={estiloCampo}>
            <option value="">Elegir causa…</option>
            {CAUSAS_RAIZ.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <textarea
            rows={2}
            maxLength={1000}
            value={valor.causaRaiz}
            onChange={set("causaRaiz")}
            placeholder="Detalle del análisis"
            className={`${estiloCampo} mt-1`}
          />
        </label>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Agregar fotos{fotosExistentes === 0 ? " (recomendado)" : ""}</span>
        <div className="grid grid-cols-2 gap-3">
          <label className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 text-base font-medium text-on-brand ${cupo <= 0 ? "pointer-events-none opacity-50" : ""}`}>
            <span aria-hidden>📷</span> Tomar foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                onFotos([...fotos, ...Array.from(e.target.files ?? [])].slice(0, Math.max(cupo, 0)));
                e.target.value = "";
              }}
            />
          </label>
          <label className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-base font-medium text-slate-700 ${cupo <= 0 ? "pointer-events-none opacity-50" : ""}`}>
            <span aria-hidden>🖼️</span> Galería
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                onFotos([...fotos, ...Array.from(e.target.files ?? [])].slice(0, Math.max(cupo, 0)));
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <span className="text-xs text-slate-500">
          {fotos.length > 0 ? `${fotos.length} foto${fotos.length === 1 ? "" : "s"} por subir. ` : ""}
          Hasta {MAX_FOTOS_INFORME} por informe.
        </span>
      </div>
    </div>
  );
}
