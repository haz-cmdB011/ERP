import { letraColumna, type FaltaColumna } from "@/lib/planeacion/formato";
import type { VistaPrevia } from "@/lib/planeacion/vista-previa";

// Muestra las primeras filas del Excel como las leyó el sistema: el encabezado
// marcado, las columnas que no se reconocen en ámbar y las filas con error en rojo.
export default function VistaPreviaFormato({
  vista,
  filasConError,
}: {
  vista: VistaPrevia;
  filasConError: number[];
}) {
  const desconocidas = new Set(vista.desconocidas);
  const columnas = vista.filas.reduce((max, f) => Math.max(max, f.celdas.length), 0);
  const letras = Array.from({ length: columnas }, (_, i) => letraColumna(i + 1));

  return (
    <div className="mt-3 rounded border border-red-200 bg-white p-3 text-slate-800">
      <p className="text-sm font-medium">
        Así leímos tu archivo (hoja “{vista.hoja}”)
      </p>

      {vista.filaEncabezado === null ? (
        <p className="mt-1 text-sm text-red-700">
          No encontramos la fila de encabezados: debe tener una columna “ITEM” con los nombres del
          formato.
        </p>
      ) : (
        <>
          {vista.faltantes.length > 0 && (
            <ListaFaltantes faltantes={vista.faltantes} />
          )}
          <p className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
            <Leyenda color="bg-sky-100" texto={`Encabezado (fila ${vista.filaEncabezado})`} />
            <Leyenda color="bg-amber-100" texto="Columna no reconocida (no se carga)" />
            <Leyenda color="bg-red-100" texto="Fila con error" />
          </p>
        </>
      )}

      <div className="mt-2 max-h-96 overflow-auto rounded border border-slate-200">
        <table className="w-max border-collapse text-xs">
          <thead>
            <tr className="sticky top-0 z-10 bg-slate-100 text-slate-500">
              <th className="border border-slate-200 px-2 py-1 font-normal">#</th>
              {letras.map((letra) => (
                <th key={letra} className="border border-slate-200 px-2 py-1 font-normal">
                  {letra}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vista.filas.map((fila) => {
              const esEncabezado = fila.numero === vista.filaEncabezado;
              const conError = filasConError.includes(fila.numero);
              const fondoFila = conError ? "bg-red-50" : "";
              return (
                <tr key={fila.numero} className={fondoFila}>
                  <td className="border border-slate-200 bg-slate-50 px-2 py-1 text-right text-slate-500">
                    {fila.numero}
                  </td>
                  {letras.map((_, i) => {
                    const columna = i + 1;
                    const texto = fila.celdas[i] ?? "";
                    let fondo = "";
                    if (esEncabezado) {
                      fondo = desconocidas.has(columna) ? "bg-amber-100 font-semibold" : "bg-sky-100 font-semibold";
                    }
                    return (
                      <td
                        key={columna}
                        className={`max-w-[12rem] truncate border border-slate-200 px-2 py-1 ${fondo}`}
                        title={texto}
                      >
                        {texto}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListaFaltantes({ faltantes }: { faltantes: FaltaColumna[] }) {
  return (
    <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-800">
      <p className="font-medium">Columnas obligatorias que faltan o están mal escritas:</p>
      <ul className="mt-1 list-disc pl-5">
        {faltantes.map((f) => (
          <li key={f.nombre}>
            <span className="font-mono">{f.nombre}</span>
            {f.sugerida ? (
              <>
                {" "}— en la columna {letraColumna(f.sugerida.columna)} dice{" "}
                <span className="font-mono">“{f.sugerida.texto}”</span>; cámbialo a{" "}
                <span className="font-mono">{f.nombre}</span>.
              </>
            ) : (
              <> — no existe ninguna columna con ese nombre.</>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded-sm border border-slate-300 ${color}`} aria-hidden="true" />
      {texto}
    </span>
  );
}
