import { redirect } from "next/navigation";

// La pantalla se movió a Archivo (pestaña Papelera): los enlaces y marcadores viejos siguen funcionando.
export default function PapeleraRedirect() {
  redirect("/planeacion/archivo?pestana=papelera");
}
