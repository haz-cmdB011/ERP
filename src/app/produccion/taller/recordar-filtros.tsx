"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const CLAVE = "erp:produccion:asignaciones:filtros";

// Recuerda los últimos filtros de la vista Lista del taller en este navegador: al entrar sin
// filtros en la URL los vuelve a aplicar, y al filtrar los guarda. La
// paginación no se guarda. Para ver todo sin filtros recordados, "Limpiar"
// manda `?estado=activas` (la vista por defecto), que sí cuenta como filtro.
export default function RecordarFiltros() {
  const router = useRouter();

  useEffect(() => {
    try {
      const actual = new URLSearchParams(window.location.search);
      actual.delete("pagina");
      actual.delete("vista");
      // Solo ?vista=lista (o la dirección vieja sin nada): no hay filtros en la URL, se recuperan los guardados.
      if (actual.size === 0) {
        const guardado = localStorage.getItem(CLAVE);
        if (guardado) router.replace(`/produccion/taller?vista=lista&${guardado}`);
        return;
      }
      localStorage.setItem(CLAVE, actual.toString());
    } catch {
      // Sin almacenamiento (modo privado): la pantalla funciona igual.
    }
  }, [router]);

  return null;
}
