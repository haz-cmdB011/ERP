import { formatoFechaDMA, formatoFechaHora } from "@/lib/resumen/entrega";
import { nombreCategoria } from "@/lib/calidad/categorias";
import {
  ESTATUS_LABELS,
  SEVERIDADES,
  TIPOS_REPORTE,
  TIPO_PROBLEMA_LABELS,
  type EstatusNoConformidad,
  type TipoProblema,
} from "@/lib/calidad/no-conformidad";
import QrCode from "./qr-code";
import type { InformeFichaItem, InformeFichaPedido, InformeFichaProduccion } from "./informe-ficha";

export interface InformeNoConformidadDatos {
  folio: string;
  elaborado_en: string;
  elaboradoPorNombre: string | null;
  descripcion: string | null;
  categoria: string | null;
  tipoReporte: string | null;
  motivo: { codigo: string; nombre: string; tipo: string } | null;
  areaDeteccion: string | null;
  responsableDeteccion: string | null;
  areaOrigen: string | null;
  responsableOrigen: string | null;
  accionesCorrectivas: string | null;
  solucion: string | null;
  solucionEn: string | null;
  material: string | null;
  manoObra: string | null;
  autoriza: string | null;
  severidad: string | null;
  causaRaizTipo: string | null;
  causaRaiz: string | null;
  // Muebles afectados = piezas rechazadas del lote; muebles fabricados =
  // verificados por Producción al evaluar. Piezas = partes afectadas.
  mueblesAfectados: number | null;
  mueblesFabricados: number | null;
  piezasAfectadas: number | null;
  estatus: EstatusNoConformidad;
  fechaCierre: string | null;
  lote: { equipo: string; proceso: string; fechaEntrega: string; folioRechazo: string | null } | null;
}

const borde = "border border-slate-400";
const barra = "bg-slate-500 py-0.5 text-center text-[11px] font-bold uppercase tracking-wide text-white";
const etiqueta = "text-[8px] font-semibold uppercase leading-tight text-slate-600";

function Celda({ label, valor }: { label: string; valor: string }) {
  return (
    <div className={`${borde} flex min-h-[26px] flex-col justify-center px-1.5 py-0.5`}>
      <span className={etiqueta}>{label}</span>
      <span className="break-words text-[11px] font-medium text-slate-900">{valor}</span>
    </div>
  );
}

function Casilla({ marcada, texto }: { marcada: boolean; texto: string }) {
  return (
    <p className={`text-[11px] ${marcada ? "font-bold text-slate-900" : "text-slate-600"}`}>
      <span aria-hidden>{marcada ? "☑" : "☐"}</span> {texto}
    </p>
  );
}

function Firma({ nombre }: { nombre: string | null }) {
  return (
    <div className="mt-auto pt-5">
      {nombre && <p className="text-center text-[10px] font-medium text-slate-900">{nombre}</p>}
      <div className="border-b border-slate-500" />
      <p className="text-center text-[7px] uppercase text-slate-500">Nombre y firma</p>
    </div>
  );
}

function Bloque({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${borde} flex flex-col gap-0.5 p-1.5 ${className}`}>
      <p className={etiqueta}>{titulo}</p>
      {children}
    </div>
  );
}

const texto = (t: string | null | undefined, vacio = "—") => (
  <p className="whitespace-pre-wrap break-words text-[11px] text-slate-800">{t?.trim() ? t : vacio}</p>
);

// Hoja del Informe de No Conformidad, con la distribución del formato
// "Producto no conforme" de Calidad. La captura el botón de PDF por [data-informe].
export default function InformeNoConformidadFicha({
  pedido,
  item,
  informe,
  imagenUrls = [],
  fotos = [],
  qrUrl,
  folioProduccion = null,
  produccion = null,
}: {
  pedido: InformeFichaPedido;
  item: InformeFichaItem;
  informe: InformeNoConformidadDatos;
  imagenUrls?: string[];
  fotos?: string[];
  qrUrl: string;
  folioProduccion?: string | null;
  produccion?: InformeFichaProduccion | null;
}) {
  const cant = (n: number | null) => (n != null ? String(n) : "—");
  const tipoProblema = informe.motivo?.tipo as TipoProblema | undefined;

  return (
    <article data-informe className="mx-auto flex w-full max-w-2xl flex-col gap-1.5 bg-white p-3 text-slate-900">
      <header className="flex items-center justify-between gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset estático; se captura como PDF */}
        <img src="/branding/mobiliarium-logo.png" alt="Mobiliarium" className="h-9" />
        <p className="text-[9px] text-slate-500">
          Elaborado el {formatoFechaHora(informe.elaborado_en)}
          {folioProduccion ? ` · Folio producción ${folioProduccion}` : ""}
        </p>
      </header>

      <div>
        <p className={barra}>Producto no conforme</p>
        <div className="grid grid-cols-3">
          <Celda label="Modelo" valor={`${item.item_code}${item.modelo ? ` — ${item.modelo}` : ""}`} />
          <Celda label="Pedido de manufactura" valor={pedido.numero_pedido} />
          <Celda label="Fecha" valor={formatoFechaDMA(informe.elaborado_en)} />
          <Celda label="Cant. pzas afectadas" valor={cant(informe.piezasAfectadas)} />
          <Celda label="Proyecto" valor={pedido.proyectos?.nombre ?? "—"} />
          <Celda label="Elaboró reporte" valor={informe.elaboradoPorNombre ?? "—"} />
          <Celda label="Cant. muebles afectados" valor={cant(informe.mueblesAfectados)} />
          <Celda label="Cliente" valor={pedido.proyectos?.cliente ?? "—"} />
          <Celda label="Folio" valor={informe.folio} />
          <Celda label="Muebles fabricados" valor={cant(informe.mueblesFabricados)} />
          <Celda label="Inicio de producción" valor={produccion?.inicio ? formatoFechaDMA(produccion.inicio) : "—"} />
          <Celda label="Término de producción" valor={produccion?.termino ? formatoFechaDMA(produccion.termino) : "—"} />
        </div>
      </div>

      <div>
        <p className={barra}>Información de la no conformidad</p>
        <div className="grid grid-cols-[1.7fr_1fr]">
          <Bloque titulo="Descripción y/o dibujo del problema:">
            <p className="text-[11px] font-semibold text-slate-900">
              Motivo: {informe.motivo ? `${informe.motivo.codigo} · ${informe.motivo.nombre}` : "—"}
            </p>
            {texto(informe.descripcion)}
            {informe.categoria && nombreCategoria(informe.categoria) && (
              <p className="text-[10px] text-slate-600">Tipo de defecto: {nombreCategoria(informe.categoria)}</p>
            )}
            {informe.lote && (
              <p className="text-[10px] text-slate-600">
                Lote: {informe.lote.equipo} · {informe.lote.proceso} · entregado {formatoFechaDMA(informe.lote.fechaEntrega)}
                {informe.lote.folioRechazo ? ` · retrabajo de ${informe.lote.folioRechazo}` : ""}
              </p>
            )}
            {(imagenUrls.length > 0 || fotos.length > 0) && (
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {[...fotos, ...imagenUrls.slice(0, 1)].map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- bucket privado vía signed URL
                  <img
                    key={url}
                    src={url}
                    alt={i < fotos.length ? `Foto ${i + 1} de la no conformidad` : `Imagen del ítem ${item.item_code}`}
                    className="max-h-52 w-full border border-slate-300 object-contain"
                  />
                ))}
              </div>
            )}
          </Bloque>
          <div className="flex flex-col">
            <Bloque titulo="Tipo de reporte">
              {TIPOS_REPORTE.map((t) => (
                <Casilla key={t} marcada={informe.tipoReporte === t} texto={t} />
              ))}
            </Bloque>
            <Bloque titulo="Área donde fue detectado:">{texto(informe.areaDeteccion)}</Bloque>
            <Bloque titulo="Responsable de la no conformidad:" className="min-h-[70px]">
              <Firma nombre={informe.responsableDeteccion} />
            </Bloque>
            <Bloque titulo="Área origen de la no conformidad:">{texto(informe.areaOrigen)}</Bloque>
            <Bloque titulo="Responsable en área de origen:" className="min-h-[70px]">
              <Firma nombre={informe.responsableOrigen} />
            </Bloque>
          </div>
        </div>
      </div>

      <div>
        <p className={barra}>Acciones correctivas</p>
        <div className="grid grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col">
            <Bloque titulo="Acciones correctivas:">{texto(informe.accionesCorrectivas)}</Bloque>
            <Bloque
              titulo={`Descripción de la solución:${informe.solucionEn && informe.solucion ? ` (${formatoFechaDMA(informe.solucionEn)})` : ""}`}
            >
              {texto(informe.solucion, "Pendiente")}
            </Bloque>
            <Bloque titulo="Material:">{texto(informe.material)}</Bloque>
            <Bloque titulo="Mano de obra:">{texto(informe.manoObra)}</Bloque>
          </div>
          <div className="flex flex-col">
            <Bloque titulo="Autorizó:" className="min-h-[80px] flex-1">
              <Firma nombre={informe.autoriza} />
            </Bloque>
            <Bloque titulo="V.B. Calidad:" className="min-h-[80px] flex-1">
              <Firma nombre={null} />
            </Bloque>
          </div>
        </div>
      </div>

      <div>
        <p className={barra}>Control y seguimiento al cierre</p>
        <div className="grid grid-cols-[1.7fr_1fr]">
          <Bloque titulo="Análisis causa raíz:" className="min-h-[90px]">
            {informe.causaRaizTipo && <p className="text-[11px] font-semibold text-slate-900">{informe.causaRaizTipo}</p>}
            {texto(informe.causaRaiz, informe.causaRaizTipo ? "" : "Pendiente")}
          </Bloque>
          <div className="flex flex-col">
            <Bloque titulo="Severidad:">
              {SEVERIDADES.map((s, i) => (
                <Casilla key={s.valor} marcada={informe.severidad === s.valor} texto={`${i + 1}) ${s.nombre}`} />
              ))}
            </Bloque>
            <Bloque titulo="Tipo de problema:">
              {(Object.keys(TIPO_PROBLEMA_LABELS) as TipoProblema[]).map((t, i) => (
                <Casilla key={t} marcada={tipoProblema === t} texto={`${i + 1}) ${TIPO_PROBLEMA_LABELS[t]}`} />
              ))}
            </Bloque>
            <Bloque titulo="Estatus:">
              {(Object.keys(ESTATUS_LABELS) as EstatusNoConformidad[]).map((e, i) => (
                <Casilla key={e} marcada={informe.estatus === e} texto={`${i + 1}) ${ESTATUS_LABELS[e]}`} />
              ))}
              <p className="text-[10px] text-slate-600">
                Fecha: {informe.estatus === "cerrado" && informe.fechaCierre ? formatoFechaDMA(informe.fechaCierre) : "—"}
              </p>
            </Bloque>
          </div>
        </div>
      </div>

      <div className="flex items-end gap-3 pt-1">
        <QrCode value={qrUrl} size={80} />
        <p className="max-w-[200px] text-[9px] text-slate-600">Escanea para rastrear este informe</p>
      </div>
    </article>
  );
}
