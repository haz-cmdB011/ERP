import { redirect } from "next/navigation";

// La bandeja de discrepancias pasó a Estimaciones (la deciden también los
// administradores de esa área). Se conserva esta ruta por los enlaces viejos.
export default function DiscrepanciasElectrificacionMovida() {
  redirect("/estimaciones/discrepancias");
}
