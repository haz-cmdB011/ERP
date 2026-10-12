// Barra de avance de una O.T. en las listas (liberados, evaluados): solo la barra y su color. El
// número exacto ("13 de 13 ítems liberados") va en el tooltip y en la etiqueta para lectores de
// pantalla. Con 0 % y `pendiente`, el fondo se tiñe de ámbar para que se lea "falta empezar" y no "vacío".
export default function BarraAvance({
  porcentaje,
  etiqueta,
  color,
  pendiente = false,
}: {
  porcentaje: number;
  etiqueta: string;
  color: string;
  pendiente?: boolean;
}) {
  const valor = Math.max(0, Math.min(100, Math.round(porcentaje)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valor}
      aria-label={etiqueta}
      title={etiqueta}
      className={`h-2 min-w-24 max-w-40 overflow-hidden rounded-full ${
        pendiente && valor === 0 ? "bg-amber-200" : "bg-slate-100"
      }`}
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${valor}%` }} />
    </div>
  );
}
