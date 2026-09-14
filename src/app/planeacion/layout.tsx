import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PlaneacionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <nav className="flex items-center gap-4 border-b border-gray-200 px-6 py-3 text-sm">
        <span className="font-semibold">ERP — Planeación</span>
        <Link href="/planeacion" className="text-gray-600 hover:text-black">
          Pedidos
        </Link>
        <Link href="/planeacion/upload" className="text-gray-600 hover:text-black">
          Cargar Excel
        </Link>
        <span className="ml-auto text-gray-500">{user.email}</span>
      </nav>
      {children}
    </div>
  );
}
