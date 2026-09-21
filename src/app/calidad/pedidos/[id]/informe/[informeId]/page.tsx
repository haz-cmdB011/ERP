import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/site-url";
import { getImagenesPorItem } from "@/lib/planeacion/imagenes";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";
import InformeFicha, {
  type InformeFichaItem,
  type InformeFichaPedido,
} from "../../informe-ficha";
import ImprimirButton from "../../imprimir-button";
import DescargarPdfButton from "../../descargar-pdf-button";

interface InformeRow {
  id: string;
  folio: string;
  aprobado: boolean;
  descripcion: string | null;
  elaborado_por: string | null;
  elaborado_en: string;
  planeacion_item_id: string;
}

interface ItemConVersion extends InformeFichaItem {
  id: string;
  pedido_versiones: { pedido_id: string } | null;
}

export default async function InformeCalidadPage({
  params,
}: {
  params: Promise<{ id: string; informeId: string }>;
}) {
  const { id, informeId } = await params;
  const supabase = await createClient();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("numero_pedido, fecha_pedido, fecha_entrega, proyectos ( nombre, cliente )")
    .eq("id", id)
    .maybeSingle<InformeFichaPedido>();

  if (!pedido) {
    notFound();
  }

  const { data: informe } = await supabase
    .from("informes_calidad")
    .select("id, folio, aprobado, descripcion, elaborado_por, elaborado_en, planeacion_item_id")
    .eq("id", informeId)
    .maybeSingle<InformeRow>();

  if (!informe) {
    notFound();
  }

  // Mismo guard que Producción: el ítem del informe debe pertenecer a ESTE
  // pedido, para no exponer un informe de otro PM si se edita la URL.
  const { data: item } = await supabase
    .from("planeacion_items")
    .select("id, item_code, modelo, descripcion, pedido_versiones!inner ( pedido_id )")
    .eq("id", informe.planeacion_item_id)
    .eq("pedido_versiones.pedido_id", id)
    .maybeSingle<ItemConVersion>();

  if (!item) {
    notFound();
  }

  let elaboradoPorNombre: string | null = null;
  if (informe.elaborado_por) {
    const { data: perfilElaboro } = await supabase
      .from("perfiles")
      .select("nombre_completo, email")
      .eq("id", informe.elaborado_por)
      .maybeSingle<{ nombre_completo: string | null; email: string | null }>();
    elaboradoPorNombre = perfilElaboro?.nombre_completo || perfilElaboro?.email || null;
  }

  const baseUrl = await getBaseUrl();
  const imagenesPorItem = await getImagenesPorItem(supabase, [item.id]);
  const nombreArchivo = nombreArchivoSeguro(
    `${pedido.numero_pedido} ${pedido.proyectos?.nombre ?? ""} - Informe ${informe.folio}.pdf`
  );

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6 print:max-w-none print:p-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/calidad/pedidos/${id}`} className="text-sm text-gray-500 underline">
          ← Volver al pedido
        </Link>
        <div className="flex gap-2">
          <DescargarPdfButton nombreArchivo={nombreArchivo} />
          <ImprimirButton />
        </div>
      </div>

      <InformeFicha
        pedido={pedido}
        item={item}
        informe={{
          folio: informe.folio,
          aprobado: informe.aprobado,
          descripcion: informe.descripcion,
          elaborado_en: informe.elaborado_en,
          elaboradoPorNombre,
        }}
        imagenUrls={imagenesPorItem.get(item.id) ?? []}
        qrUrl={`${baseUrl}/calidad/pedidos/${id}/informe/${informe.id}`}
      />
    </main>
  );
}
