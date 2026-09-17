// Sanitiza un nombre para usarlo como nombre de archivo descargado: quita
// caracteres inválidos en Windows/macOS ( \ / : * ? " < > | ) pero conserva
// espacios y acentos, a diferencia del sanitizado agresivo que se usa para
// las rutas de Storage (ahí sí hace falta ASCII puro).
export function nombreArchivoSeguro(nombre: string): string {
  return nombre.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}
