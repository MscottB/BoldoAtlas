/** Adónde va el foco tras quitar una fila: la fila siguiente, el título de su sección, el de la sección siguiente o (null) el h1. */
export type Foco = { seccion: string; fila?: string } | null;

/** `secciones`: las que se ven, en orden, con las claves de sus filas, tal como estaban antes de quitar `clave`. */
export function focoTras(secciones: { tipo: string; claves: string[] }[], tipo: string, clave: string): Foco {
  const i = secciones.findIndex((s) => s.tipo === tipo);
  if (i < 0) return null;
  const { claves } = secciones[i];
  const j = claves.indexOf(clave);
  if (j >= 0 && j < claves.length - 1) return { seccion: tipo, fila: claves[j + 1] };
  if (claves.some((c) => c !== clave)) return { seccion: tipo };
  const siguiente = secciones[i + 1];
  return siguiente ? { seccion: siguiente.tipo } : null;
}
