import { createClient } from "@/lib/supabase/server";
import CambiarPasswordForm from "./cambiar-password-form";

export default async function CuentaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Mi cuenta</h1>
        <p className="text-sm text-gray-600">{user?.email}</p>
      </div>
      <CambiarPasswordForm />
    </main>
  );
}
