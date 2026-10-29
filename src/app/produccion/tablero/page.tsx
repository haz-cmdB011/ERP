import { redirect } from "next/navigation";

// El tablero se quitó junto con el taller: lleva al panel de asignación.
export default function TableroPage() {
  redirect("/produccion/panel");
}
