import Migas from "@/components/migas";
import UploadForm from "./upload-form";

export default function PlaneacionUploadPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Migas items={[{ etiqueta: "Pedidos", href: "/planeacion" }, { etiqueta: "Cargar Excel" }]} />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Cargar Excel</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Sube el Excel &quot;PEDIDO DE MANUFACTURA&quot; (<span className="font-mono">.xlsx</span> o{" "}
          <span className="font-mono">.xlsm</span>). Cada carga crea una nueva versión del pedido y el
          historial se conserva. Al terminar, ábrelo desde Pedidos para revisarlo; Producción lo libera después.
        </p>
      </div>
      <div className="w-full max-w-xl">
        <UploadForm />
      </div>
    </main>
  );
}
