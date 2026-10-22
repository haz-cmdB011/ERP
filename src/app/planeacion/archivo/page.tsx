import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeAdministrarPlaneacion } from "@/lib/auth/get-perfil";
import Migas from "@/components/migas";
import Pestanas, { type Pestana, idPanel, idPestana } from "@/components/pestanas";
import CanceladosContenido from "./cancelados";
import PapeleraContenido from "./papelera";

export const metadata: Metadata = { title: "Archivo" };

const BASE = "archivo";

// Archivo: lo que salió del flujo de Planeación. Dos pestañas en la dirección (?pestana=): Cancelados
// (pedidos y muebles cancelados, con su motivo) y Papelera (pedidos enviados a la papelera, solo para
// quien administra). /planeacion/cancelados y /planeacion/papelera redirigen aquí.
export default async function ArchivoPage({
  searchParams,
}: {
  searchParams: Promise<{ pestana?: string }>;
}) {
  const { pestana } = await searchParams;
  const perfil = await getPerfilActual(await createClient());
  const veLaPapelera = puedeAdministrarPlaneacion(perfil);
  const activa = pestana === "papelera" && veLaPapelera ? "papelera" : "cancelados";

  const items: Pestana[] = [{ id: "cancelados", etiqueta: "Cancelados", icono: "cancelados", href: "/planeacion/archivo" }];
  if (veLaPapelera) items.push({ id: "papelera", etiqueta: "Papelera", icono: "archivo", href: "/planeacion/archivo?pestana=papelera" });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Migas items={[{ etiqueta: "Pedidos", href: "/planeacion" }, { etiqueta: "Archivo" }]} />
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Archivo</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Lo que ya no está en la lista de Pedidos: {veLaPapelera ? "lo cancelado y lo enviado a la papelera" : "lo cancelado"}.
        </p>
      </div>
      <Pestanas base={BASE} items={items} activa={activa} etiqueta="Archivo" />
      <div role="tabpanel" id={idPanel(BASE)} aria-labelledby={idPestana(BASE, activa)} tabIndex={-1}>
        {activa === "papelera" ? <PapeleraContenido /> : <CanceladosContenido />}
      </div>
    </main>
  );
}
