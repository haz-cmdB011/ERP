"use client";

import { useSyncExternalStore } from "react";
import {
  agregarAlCarrito,
  leerCarrito,
  quitarDelCarrito,
  type ItemCarrito,
} from "./carrito";
import { esProceso, type Proceso } from "./asignaciones";

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

// Rutas elegidas en el carrito para muebles que todavía no se liberan: la base solo guarda
// la ruta de lo liberado, así que viven aquí (por id de mueble) y se mandan al liberar.
const CLAVE_RUTAS = "erp.produccion.carrito.rutas.v1";
const SIN_RUTAS: Record<string, Proceso[]> = {};
let cacheRutas: Record<string, Proceso[]> | null = null;
const oyentesRutas = new Set<() => void>();

function leerRutas(): Record<string, Proceso[]> {
  try {
    const crudo: unknown = JSON.parse(localStorage.getItem(CLAVE_RUTAS) ?? "{}");
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return SIN_RUTAS;
    const limpio: Record<string, Proceso[]> = {};
    for (const [id, lista] of Object.entries(crudo)) {
      if (Array.isArray(lista) && lista.length > 0 && lista.every(esProceso)) limpio[id] = lista;
    }
    return limpio;
  } catch {
    return SIN_RUTAS;
  }
}

function rutasActuales(): Record<string, Proceso[]> {
  if (cacheRutas === null) cacheRutas = leerRutas();
  return cacheRutas;
}

function guardarRutas(siguiente: Record<string, Proceso[]>) {
  cacheRutas = siguiente;
  try {
    localStorage.setItem(CLAVE_RUTAS, JSON.stringify(siguiente));
  } catch {
    // Sin almacenamiento: la ruta elegida vive solo en esta pestaña.
  }
  oyentesRutas.forEach((o) => o());
}

function suscribirRutas(oyente: () => void) {
  oyentesRutas.add(oyente);
  const alCambiar = (e: StorageEvent) => {
    if (e.key !== CLAVE_RUTAS) return;
    cacheRutas = null;
    oyente();
  };
  window.addEventListener("storage", alCambiar);
  return () => {
    oyentesRutas.delete(oyente);
    window.removeEventListener("storage", alCambiar);
  };
}

// Elige la ruta de un mueble por liberar (null la olvida: vuelve a la sugerida).
export function elegirRuta(itemId: string, procesos: Proceso[] | null) {
  const { [itemId]: _anterior, ...resto } = rutasActuales();
  void _anterior;
  guardarRutas(procesos && procesos.length > 0 ? { ...resto, [itemId]: procesos } : resto);
}

export function olvidarRutas(ids: Iterable<string>) {
  const fuera = new Set(ids);
  guardarRutas(Object.fromEntries(Object.entries(rutasActuales()).filter(([id]) => !fuera.has(id))));
}

export function useRutasCarrito(): Record<string, Proceso[]> {
  return useSyncExternalStore(suscribirRutas, rutasActuales, () => SIN_RUTAS);
}
