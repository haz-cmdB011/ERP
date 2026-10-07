import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  esMaquilador,
  getPerfilActual,
  puedeDecidirDiscrepancias,
  puedeVerPrecioSugerido,
} from "@/lib/auth/get-perfil";
import { contarRecibosPorEstado, listarAntiguedadPendientes } from "@/lib/estimaciones/por-revisar";
import { detallePendientes, resumirPendientes } from "@/lib/estimaciones/resumen-pendientes";
import { contarPendientes, listarResumenDiscrepancias } from "@/lib/estimaciones/discrepancias-resumen";
import ResumenInicio, { type TarjetaResumen } from "@/components/resumen-inicio";
import Bienvenida from "@/components/bienvenida";
import Inclinable from "@/components/inclinable";

const TARJETAS: {
  href: string;
  titulo: string;
  descripcion: string;
  icono: React.ReactNode;
}[] = [
  {
    href: "/estimaciones/recibos",
    titulo: "Generador de Recibos",
    descripcion: "Captura los recibos de maquila y obtén el precio sugerido de cada pieza.",
    icono: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>
    ),
  },
  {
    href: "/estimaciones/registro?estado=pendiente",
    titulo: "Por revisar",
    descripcion:
      "Recibos de maquiladores pendientes: acepta o modifica cada precio. No se pagan hasta quedar revisados.",
    icono: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    href: "/estimaciones/registro",
    titulo: "Registro de recibos",
    descripcion: "Consulta los recibos guardados, ordenados por folio, con sus totales y su ficha.",
    icono: <path d="M4 6h16M4 12h16M4 18h10" />,
  },
  {
    href: "/estimaciones/reportes",
    titulo: "Reporte semanal",
    descripcion:
      "Lo pagado por maquilador y área, el PM contra cobrado por O.T. y el Excel con el formato de maquila para Finanzas.",
    icono: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
];

export default async function EstimacionesPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (esMaquilador(perfil)) {
    redirect("/estimaciones/recibos");
  }

  // Números del panel. Solo quien ve el precio sugerido revisa recibos; solo
  // quien decide discrepancias ve ese contador.
  const reviso = puedeVerPrecioSugerido(perfil);
  const [pendientes, porPagar, discrepancias] = await Promise.all([
    // null = no se pudo contar: la tarjeta se omite en vez de mostrar un 0 falso.
    reviso
      ? listarAntiguedadPendientes(supabase)
          .then((filas) => resumirPendientes(filas, new Date()))
          .catch(() => null)
      : null,
    reviso ? contarRecibosPorEstado(supabase, "revisado").catch(() => null) : null,
    puedeDecidirDiscrepancias(perfil)
      ? listarResumenDiscrepancias(supabase).then(contarPendientes).catch(() => null)
      : null,
  ]);
  const tarjetasResumen: TarjetaResumen[] = [];
  if (pendientes !== null) {
    tarjetasResumen.push({
      valor: pendientes.total,
      etiqueta: "Recibos por revisar",
      detalle: detallePendientes(pendientes),
      href: "/estimaciones/registro?estado=pendiente",
      tono: "atencion",
    });
  }
  if (porPagar !== null) {
    tarjetasResumen.push({
      valor: porPagar,
      etiqueta: "Revisados sin pagar",
      detalle: "listos para marcar como pagados",
      href: "/estimaciones/registro?estado=revisado",
    });
  }
  if (discrepancias !== null) {
    tarjetasResumen.push({
      valor: discrepancias,
      etiqueta: "Discrepancias por decidir",
      detalle: "cantidades que superan lo declarado",
      href: "/estimaciones/discrepancias",
      tono: "atencion",
    });
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida
        acciones={[
          { href: "/estimaciones/recibos", etiqueta: "Generar un recibo" },
          { href: "/estimaciones/registro?estado=pendiente", etiqueta: "Ver por revisar" },
        ]}
      />
      <ResumenInicio tarjetas={tarjetasResumen} />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Estimaciones</h1>
        <p className="mt-1 text-sm text-slate-500">
          Paneles del área. Selecciona con qué quieres trabajar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TARJETAS.map((t) => (
          <Inclinable key={t.href}>
          <Link
            href={t.href}
            className="group flex h-full gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-800 transition-colors group-hover:bg-brand-500 group-hover:text-on-brand">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                {t.icono}
              </svg>
            </span>
            <span className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 group-hover:text-brand-700">
                {t.titulo}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{t.descripcion}</p>
            </span>
          </Link>
          </Inclinable>
        ))}
      </div>
    </main>
  );
}
