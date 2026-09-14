import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "./upload-form";

export default async function PlaneacionUploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
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
