import { redirect } from "next/navigation";

// El tablero ahora es la vista "Por equipo" de /produccion/taller.
export default function TableroPage() {
  redirect("/produccion/taller");
}
