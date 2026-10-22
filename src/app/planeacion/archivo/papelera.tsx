import { createClient } from "@/lib/supabase/server";
import EstadoVacio from "@/components/estado-vacio";
import { formatoFechaHora } from "@/lib/resumen/entrega";
import PedidosEliminados from "../pedidos-eliminados";

interface PedidoEliminadoRow {
  id: string;
  numero_pedido: string;
  eliminado_en: string | null;
  proyectos: { nombre: string; cliente: string } | null;
}

// Contenido de la pestaña Papelera de Archivo (solo la ven quienes administran Planeación): los pedidos que se
// enviaron a la papelera desde la lista. Aquí se restauran o se borran de verdad.
export default async function PapeleraContenido() {
  const supabase = await createClient();
  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select("id, numero_pedido, eliminado_en, proyectos ( nombre, cliente )")
    .not("eliminado_en", "is", null)
    .order("eliminado_en", { ascending: false })
    .returns<PedidoEliminadoRow[]>();

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-slate-600">
        Pedidos que enviaste a la papelera. Puedes <strong>restaurarlos</strong> para que vuelvan a Pedidos, o
        eliminarlos definitivamente (eso ya no se puede deshacer).
      </p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudo cargar la papelera: {error.message}
        </p>
      )}

      {!error && (!pedidos || pedidos.length === 0) && (
        <EstadoVacio
          titulo="La papelera está vacía"
          descripcion="Cuando envíes un pedido a la papelera desde la lista de Pedidos, lo verás aquí."
          accion={{ href: "/planeacion", etiqueta: "Volver a Pedidos" }}
        />
      )}

      {pedidos && pedidos.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <PedidosEliminados
            pedidos={pedidos.map((p) => ({
              id: p.id,
              numero_pedido: p.numero_pedido,
              proyecto: p.proyectos?.nombre ?? "—",
              cliente: p.proyectos?.cliente ?? "—",
              eliminado_en: formatoFechaHora(p.eliminado_en),
            }))}
          />
        </div>
      )}
    </div>
  );
}
