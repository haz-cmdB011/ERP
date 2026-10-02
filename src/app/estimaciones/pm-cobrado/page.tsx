import { redirect } from "next/navigation";

// El PM contra cobrado vive ahora dentro del dashboard del reporte semanal. El
// detalle por O.T. sigue en /estimaciones/pm-cobrado/<OT>.
export default function PmCobradoPage() {
  redirect("/estimaciones/reportes#pm-cobrado");
}
