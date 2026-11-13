import { redirect } from "next/navigation";

// La pantalla del taller se quitó: lo que tiene cada equipo sale en el inicio de Producción y las
// asignaciones se ven y se registran en el panel de asignación. Se conserva la dirección (y las viejas
// /produccion/tablero y /produccion/asignaciones) para que los enlaces guardados no den 404.
export default function TallerPage() {
  redirect("/produccion/panel");
}
