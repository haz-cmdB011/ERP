import type { Metadata } from "next";

// La página de login es un componente de cliente y no puede declarar su
// propio título; lo pone este layout.
export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
