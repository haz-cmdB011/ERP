import { redirect } from "next/navigation";

// La pantalla se movió a Archivo (pestaña Cancelados): los enlaces y marcadores viejos siguen funcionando.
export default function CanceladosRedirect() {
  redirect("/planeacion/archivo");
}
