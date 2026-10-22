import CuentaContenido from "@/components/cuenta-contenido";
import Migas from "@/components/migas";

export const metadata = { title: "Mi perfil" };

export default function CuentaPage() {
  return (
    <>
      <Migas items={[{ etiqueta: "Pedidos", href: "/planeacion" }, { etiqueta: "Mi perfil" }]} className="mx-auto max-w-xl px-4 pt-4 sm:px-6" />
      <CuentaContenido />
    </>
  );
}
