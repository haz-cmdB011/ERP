import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeAdministrarPlaneacion } from "@/lib/auth/get-perfil";
import Migas from "@/components/migas";
import TablaPedidos, { type PedidoLista } from "../../tabla-pedidos";

// Página de una O.T.: la lista de sus PM.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ ot: string }>;
}): Promise<Metadata> {
  const { ot } = await params;
  return { title: `O.T. ${ot}` };
}

export default async function OrdenTrabajoPage({ params }: { params: Promise<{ ot: string }> }) {
  const { ot } = await params;
  // Formato de O.T. de la columna generada pedidos.orden_trabajo: "134-26".
  if (!/^\d+-\d{2}$/.test(ot)) {
    notFound();
  }
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const esAdmin = puedeAdministrarPlaneacion(perfil);

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select(
      "id, numero_pedido, fecha_entrega, proyectos ( nombre, cliente ), pedido_versiones ( id, numero_version, es_version_activa )"
    )
    .eq("orden_trabajo", ot)
    .is("eliminado_en", null)
    .is("eliminado_definitivo_en", null)
    .returns<PedidoLista[]>();

  if (!error && (!pedidos || pedidos.length === 0)) {
    notFound();
  }

  const pms = (pedidos ?? []).sort((a, b) =>
    a.numero_pedido.localeCompare(b.numero_pedido, "es", { numeric: true })
  );
  const primero = pms[0];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Migas items={[{ etiqueta: "Pedidos", href: "/planeacion" }, { etiqueta: `O.T. ${ot}` }]} />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          O.T. <span className="font-mono">{ot}</span>
        </h1>
        {primero && (
          <p className="text-sm text-slate-600">
            {primero.proyectos?.nombre} — {primero.proyectos?.cliente}
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los PM: {error.message}
        </p>
      )}

      {pms.length > 0 && (
        <TablaPedidos
          pedidos={pms}
          esAdmin={esAdmin}
          mostrarProyecto={pms.some(
            (p) =>
              p.proyectos?.nombre !== primero?.proyectos?.nombre ||
              p.proyectos?.cliente !== primero?.proyectos?.cliente
          )}
        />
      )}
    </main>
  );
}
