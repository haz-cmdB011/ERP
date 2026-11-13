import { redirect } from "next/navigation";

// La lista de asignaciones se quitó junto con el taller: lleva al panel de asignación.
export default function AsignacionesPage() {
  redirect("/produccion/panel");
}
