// Orden de las pestañas del submenú de cada área, que cada persona puede
// cambiar. Funciones puras sobre listas de href; la persistencia y el DOM
// viven en src/components/subnav-ordenable.tsx.

// Orden final: primero las pestañas guardadas que siguen existiendo (en el
// orden guardado), luego las nuevas en su orden natural.
export function ordenFinal(actuales: string[], guardado: unknown): string[] {
  const lista = Array.isArray(guardado) ? guardado.filter((x): x is string => typeof x === "string") : [];
  const presentes = new Set(actuales);
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const href of lista) {
    if (presentes.has(href) && !vistos.has(href)) {
      resultado.push(href);
      vistos.add(href);
    }
  }
  for (const href of actuales) if (!vistos.has(href)) resultado.push(href);
  return resultado;
}

// Mueve una pestaña `delta` lugares (-1 izquierda, +1 derecha), sin salirse.
export function moverPestana(orden: string[], href: string, delta: number): string[] {
  const i = orden.indexOf(href);
  if (i === -1) return orden;
  const j = Math.min(Math.max(i + delta, 0), orden.length - 1);
  if (i === j) return orden;
  const copia = [...orden];
  copia.splice(i, 1);
  copia.splice(j, 0, href);
  return copia;
}

// Suelta `href` en el lugar de `destino` (arrastrar y soltar): queda antes de
// ese destino si venía de la derecha y después si venía de la izquierda.
export function soltarSobre(orden: string[], href: string, destino: string): string[] {
  const i = orden.indexOf(href);
  const j = orden.indexOf(destino);
  if (i === -1 || j === -1 || i === j) return orden;
  const copia = [...orden];
  copia.splice(i, 1);
  copia.splice(j, 0, href);
  return copia;
}
