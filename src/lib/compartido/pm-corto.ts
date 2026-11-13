// Nombre corto de un PM para las pantallas donde sobra información. El nombre completo trae lo que
// distingue a un PM dentro de su O.T. ("PM009-26 ACTUALIZACION", "PM193-24 SOTANO 1", "SDC-1 PM009-26"),
// pero a la vista basta con:
//   - si es una solicitud de cambio, solo su SDC: "SDC-1";
//   - si no, solo el PM: "PM009-26" (o "2PM134-26" cuando la O.T. tiene varios).
// Lo que no se reconoce se devuelve como viene. El nombre completo sigue en la base y conviene dejarlo
// en el `title` del elemento para quien quiera verlo.

const PATRON_SDC = /(?<![A-Z])SDC\s*-?\s*0*(\d{1,3})(?!\d)/i;
const PATRON_PM = /(?<![A-Z\d])(\d{1,3}PM|PM)\s*-?\s*(\d{1,5}-\d{2,4})(?!\d)/i;

export function pmCorto(numeroPm: string | null | undefined): string {
  const texto = (numeroPm ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return "";

  const sdc = texto.match(PATRON_SDC);
  if (sdc) return `SDC-${sdc[1]}`;

  const pm = texto.match(PATRON_PM);
  if (pm) return `${pm[1].toUpperCase()}${pm[2]}`;

  return texto;
}
