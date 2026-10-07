import UploadForm from "./upload-form";

export default function PlaneacionUploadPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Carga de Planeación</h1>
        <p className="text-sm text-gray-600">
          Sube el Excel &quot;PEDIDO DE MANUFACTURA&quot; (<span className="font-mono">.xlsx</span> o{" "}
          <span className="font-mono">.xlsm</span>). Cada carga crea una nueva versión del pedido y el
          historial se conserva.
        </p>
      </div>
      <UploadForm />
    </main>
  );
}
