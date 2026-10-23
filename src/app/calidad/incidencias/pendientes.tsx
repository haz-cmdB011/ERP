import type { PendientesViejos } from "@/lib/calidad/incidencias";
import Barras from "./barras";
import type { OpcionesFormulario } from "./formulario-reporte";
import TablaReportes from "./tabla-reportes";
import Tarjeta from "./tarjeta";

// Lo abierto que lleva más de 30 días sin cerrarse, sin importar el periodo que
// se esté mirando: cuántos son, de qué antigüedad y de quién, y los más viejos
// con sus botones para editarlos o cerrarlos.
export default function Pendientes({
  datos,
  dias,
  opciones,
  hoy,
}: {
  datos: PendientesViejos;
  dias: number;
  opciones: OpcionesFormulario;
  hoy: string;
}) {
  const descripcion =
    datos.total === 0
      ? `Nada abierto con más de ${dias} días.`
      : `${datos.total} ${datos.total === 1 ? "reporte abierto lleva" : "reportes abiertos llevan"} más de ${dias} días sin cerrarse`;
  return (
    <Tarjeta titulo={`Pendientes de más de ${dias} días`} descripcion={descripcion} desplegable>
      {datos.total === 0 ? (
        <p className="text-sm text-slate-500">No hay pendientes viejos con estos filtros.</p>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Barras
              plana
              titulo="Por antigüedad"
              filas={datos.rangos.map((r) => ({ nombre: r.etiqueta, total: r.total, abiertas: r.total }))}
              maximo={4}
            />
            <Barras
              plana
              titulo="Por quién auditó"
              filas={datos.porAuditor}
              maximo={8}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {datos.masViejas.length < datos.total ? `Los ${datos.masViejas.length} más viejos` : "Del más viejo al más reciente"}
            </h3>
            <TablaReportes filas={datos.masViejas} opciones={opciones} hoy={hoy} mostrarDias />
          </div>
        </>
      )}
      {datos.sinFecha > 0 && (
        <p className="text-xs text-slate-500">
          Otros {datos.sinFecha} abiertos no tienen fecha, así que no se sabe qué tan viejos son.
        </p>
      )}
    </Tarjeta>
  );
}
