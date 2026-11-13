import type { Metadata } from "next";
import AuthShell from "@/components/auth-shell";
import InstalarApp from "./instalar-app";

// Pública a propósito: es a donde lleva el QR de la hoja (/instalar/hoja) antes de que la persona tenga sesión.
export const metadata: Metadata = {
  title: "Instalar la app",
  robots: { index: false, follow: false },
};

export default function InstalarPage() {
  return (
    <AuthShell
      titulo="Instala la app"
      descripcion="Úsala en tu celular como cualquier otra app. Después entras con tu correo y tu contraseña, como siempre."
    >
      <InstalarApp />
    </AuthShell>
  );
}
