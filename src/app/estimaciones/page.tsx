import Link from "next/link";
import { Suspense } from "react";
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
import { type TarjetaResumen } from "@/components/resumen-inicio";
import { ResumenEnMenu } from "@/components/resumen-menu";
import Bienvenida from "@/components/bienvenida";
import ResumenPorLlegar, { ResumenPorLlegarCargando } from "./por-llegar/resumen-por-llegar";

const TARJETAS: {
  href: string;
  titulo: string;
  detalle: string;
  // Color propio de cada acceso (borde superior, velo y icono), sin perder el verde de la marca.
  tono: { tarjeta: string; icono: string };
  icono: React.ReactNode;
}[] = [
  {
    href: "/estimaciones/recibos",
    titulo: "Generador de Recibos",
    detalle: "Captura un recibo y compáralo contra el precio sugerido",
    tono: {
      tarjeta: "border-t-emerald-500 from-emerald-50",
      icono: "bg-emerald-100 text-emerald-800 group-hover:bg-emerald-500 group-hover:text-white",
    },
    icono: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>
    ),
  },
  {
    href: "/estimaciones/registro",
    titulo: "Registro de recibos",
    detalle: "Revisa, aprueba y marca como pagados",
    tono: {
      tarjeta: "border-t-emerald-500 from-emerald-50",
      icono: "bg-emerald-100 text-emerald-800 group-hover:bg-emerald-500 group-hover:text-white",
    },
    icono: <path d="M4 6h16M4 12h16M4 18h10" />,
  },
  {
    href: "/estimaciones/reportes",
    titulo: "Análisis de pagos",
    detalle: "Gráficas y cierres por semana",
    tono: {
      tarjeta: "border-t-emerald-500 from-emerald-50",
      icono: "bg-emerald-100 text-emerald-800 group-hover:bg-emerald-500 group-hover:text-white",
    },
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
      <Bienvenida />
      <ResumenEnMenu tarjetas={tarjetasResumen} />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Estimaciones</h1>
      </div>

      {/* Lo que Calidad ya aprobó y está por cobrarse: se carga aparte para no frenar el panel. */}
      {reviso && (
        <Suspense fallback={<ResumenPorLlegarCargando />}>
          <ResumenPorLlegar />
        </Suspense>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {TARJETAS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`group flex h-full items-center gap-4 rounded-xl border border-slate-200 border-t-4 bg-gradient-to-b to-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${t.tono.tarjeta}`}
          >
            <span
              className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${t.tono.icono}`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                {t.icono}
              </svg>
            </span>
            <span className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">{t.titulo}</h2>
              <p className="text-sm text-slate-500">{t.detalle}</p>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
