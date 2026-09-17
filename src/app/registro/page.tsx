import Link from "next/link";
import RegistroForm from "./registro-form";

export default function RegistroPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">ERP — Crear cuenta</h1>
        <p className="mt-1 text-sm text-gray-600">
          Tu cuenta se crea con el nivel de acceso más básico. Un administrador
          podrá asignarte un rol y área después.
        </p>
      </div>

      <RegistroForm />

      <Link href="/login" className="text-left text-xs text-gray-500 underline">
        ¿Ya tienes cuenta? Inicia sesión
      </Link>
    </main>
  );
}
