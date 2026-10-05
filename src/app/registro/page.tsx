import type { Metadata } from "next";
import Link from "next/link";
import AuthShell, { ENLACE_AUTH } from "@/components/auth-shell";
import RegistroForm from "./registro-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegistroPage() {
  return (
    <AuthShell
      titulo="Crear cuenta"
      descripcion="Tu cuenta se crea con el nivel de acceso más básico. Un administrador podrá asignarte un rol y área después."
      pie={
        <Link href="/login" className={`${ENLACE_AUTH} w-fit`}>
          ¿Ya tienes cuenta? Inicia sesión
        </Link>
      }
    >
      <RegistroForm />
    </AuthShell>
  );
}
