import UploadForm from "./upload-form";

export default function PlaneacionUploadPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Carga de Planeación</h1>
        <p className="text-sm text-gray-600">
          Sube el Excel del pedido de manufactura (formato &quot;PEDIDO DE
          MANUFACTURA&quot;). Cada carga crea una nueva versión del pedido; el
          historial completo se conserva.
        </p>
      </div>
      <UploadForm />
    </main>
  );
}
