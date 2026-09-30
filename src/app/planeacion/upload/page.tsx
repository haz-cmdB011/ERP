import UploadForm from "./upload-form";

export default function PlaneacionUploadPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Carga de Planeación</h1>
        <p className="text-sm text-gray-600">
          Arrastra o elige uno o varios Excel de pedido de manufactura (formato
          &quot;PEDIDO DE MANUFACTURA&quot;), en <span className="font-mono">.xlsx</span> o con macros{" "}
          <span className="font-mono">.xlsm</span> (las macros no se ejecutan). Cada carga crea una nueva versión del pedido; el
          historial completo se conserva.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Varios PM de una misma Orden de Trabajo se distinguen con un número al
          inicio: <span className="font-mono">1PM134-26</span>,{" "}
          <span className="font-mono">2PM134-26</span>… Cada uno se guarda como un
          PM distinto y en Pedidos aparecen agrupados en la OT{" "}
          <span className="font-mono">134-26</span>.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Si el Excel trae varias hojas con formato de PM (ej. <span className="font-mono">PEDIDO</span>{" "}
          y <span className="font-mono">SDC-1</span>), cada hoja se carga como su propio PM con sus
          ítems e imágenes; las hojas sin ese formato se ignoran.
        </p>
      </div>
      <UploadForm />
    </main>
  );
}
