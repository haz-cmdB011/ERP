"use client";

import { useSyncExternalStore } from "react";
import {
  agregarAlCarrito,
  leerCarrito,
  quitarDelCarrito,
  type ItemCarrito,
} from "./carrito";

// Carrito en el propio aparato (localStorage): sobrevive a cambiar de PM u O.T.
// y a recargar. Es por aparato y por navegador; no se comparte entre personas.
const CLAVE = "erp.produccion.carrito.v1";
const VACIO: ItemCarrito[] = [];

let cache: ItemCarrito[] | null = null;
const oyentes = new Set<() => void>();

function leerAlmacen(): ItemCarrito[] {
  try {
    return leerCarrito(localStorage.getItem(CLAVE));
  } catch {
    return VACIO;
  }
}

function actual(): ItemCarrito[] {
  if (cache === null) cache = leerAlmacen();
  return cache;
}

function guardar(siguiente: ItemCarrito[]) {
  cache = siguiente;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(siguiente));
  } catch {
    // Sin almacenamiento (ventana privada, cuota): el carrito vive solo en esta pestaña.
  }
  oyentes.forEach((o) => o());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  // Otra pestaña cambió el carrito.
  const alCambiar = (e: StorageEvent) => {
    if (e.key !== CLAVE) return;
    cache = null;
    oyente();
  };
  window.addEventListener("storage", alCambiar);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener("storage", alCambiar);
  };
}

export function agregarItems(nuevos: ItemCarrito[]): number {
  const antes = actual();
  const despues = agregarAlCarrito(antes, nuevos);
  guardar(despues);
  return despues.length - antes.length;
}

export function quitarItems(ids: Iterable<string>) {
  guardar(quitarDelCarrito(actual(), ids));
}

export function vaciarCarrito() {
  guardar([]);
}

// Hasta hidratar (servidor) el carrito se ve vacío, para no desajustar el HTML.
export function useCarrito(): ItemCarrito[] {
  return useSyncExternalStore(suscribir, actual, () => VACIO);
}
