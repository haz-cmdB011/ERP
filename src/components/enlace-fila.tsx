"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

// Enlace para las filas de una lista larga (pedidos, folios, recibos, ítems). Next precarga en
// el servidor cada enlace en cuanto aparece en pantalla; en una tabla de cientos de filas son
// cientos de peticiones que casi nadie abre. Este precarga solo el que se va a abrir: al
// acercarle el mouse, tocarlo o llegar a él con el teclado. Se ve y navega igual que <Link>.
type Props = Omit<ComponentProps<typeof Link>, "prefetch" | "href"> & { href: string };

export default function EnlaceFila({ href, onMouseEnter, onTouchStart, onFocus, ...resto }: Props) {
  const router = useRouter();
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        router.prefetch(href);
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        router.prefetch(href);
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        router.prefetch(href);
        onFocus?.(e);
      }}
      {...resto}
    />
  );
}
