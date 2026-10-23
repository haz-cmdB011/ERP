// .in() con muchos ids rompe el largo de la dirección de la consulta: se pide por tandas.
export function tandas<T>(lista: T[], tamano = 50): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}
