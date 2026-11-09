// Hora de la bitácora del inicio de Producción (hora de México). Sin base de datos ni
// navegador, para poder probarlo.

// "05:30" -> "10:30" en la hora de México.
export function horaMexico(iso: string): string {
  const partes = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${v("hour")}:${v("minute")}`;
}
