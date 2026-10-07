"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { claveBorrador, leerBorrador, serializarBorrador } from "@/lib/estimaciones/borrador";

// Borrador local de un recibo en captura (ver lib/estimaciones/borrador.ts).
//  - Guarda `datos` en el navegador poco después de cada cambio.
//  - Al abrir la captura ofrece recuperar el borrador anterior.
//  - Avisa antes de cerrar la pestaña si hay cambios sin guardar.
// `datos` debe ser JSON simple y sin campos de pantalla (ids, plegado).
export function useBorradorRecibo<T>({
  tipo,
  datos,
  restaurar,
  guardarLocal = true,
}: {
  tipo: string;
  datos: T;
  restaurar: (datos: T) => void;
  // false al modificar un recibo ya guardado: ahí no hay borrador que ofrecer,
  // pero sí se avisa antes de salir con cambios.
  guardarLocal?: boolean;
}) {
  const actual = JSON.stringify(datos);
  // Lo último que está a salvo: el estado inicial, o lo recién guardado.
  const [base, setBase] = useState(actual);
  // Tras guardar, el formulario puede limpiarse (Electrificación deja todo listo
  // para otro recibo): la siguiente pasada toma como "a salvo" lo que quede.
  const [resincronizar, setResincronizar] = useState(false);
  if (resincronizar) {
    setResincronizar(false);
    setBase(actual);
  }
  const sucio = !resincronizar && actual !== base;

  const [clave, setClave] = useState<string | null>(null);
  // Borrador de una sesión anterior que espera la decisión de la persona.
  const [pendiente, setPendiente] = useState<{ guardadoEn: string; datos: T } | null>(null);

  useEffect(() => {
    if (!guardarLocal) return;
    let vigente = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        const usuarioId = data.session?.user.id;
        if (!vigente || !usuarioId) return;
        const k = claveBorrador(tipo, usuarioId);
        setClave(k);
        try {
          const guardado = leerBorrador<T>(window.localStorage.getItem(k), new Date());
          if (guardado) setPendiente({ guardadoEn: guardado.guardadoEn, datos: guardado.datos });
        } catch {
          // Sin acceso al almacenamiento (modo privado): se trabaja sin borrador.
        }
      });
    return () => {
      vigente = false;
    };
  }, [tipo, guardarLocal]);

  // Guardado automático (con pausa para no escribir en cada tecla). No toca
  // nada mientras haya un borrador por decidir: sería pisarlo.
  useEffect(() => {
    if (!clave || pendiente || !sucio) return;
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(clave, serializarBorrador(JSON.parse(actual) as T, new Date()));
      } catch {
        // Almacenamiento lleno o bloqueado: el aviso de salida sigue protegiendo.
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [clave, pendiente, sucio, actual]);

  useEffect(() => {
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  const borrar = useCallback(() => {
    if (!clave) return;
    try {
      window.localStorage.removeItem(clave);
    } catch {
      // nada que borrar
    }
  }, [clave]);

  return {
    // Borrador anterior por recuperar o descartar (null si no hay).
    pendiente,
    recuperar() {
      if (!pendiente) return;
      restaurar(pendiente.datos);
      setPendiente(null);
    },
    descartar() {
      borrar();
      setPendiente(null);
    },
    // Llamar al guardar el recibo: el borrador ya no hace falta.
    alGuardar() {
      borrar();
      setResincronizar(true);
    },
    // Hay cambios que todavía no están guardados en la base.
    sucio,
  };
}
