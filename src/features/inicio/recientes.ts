// «Abierto recientemente» (Inicio): funciones puras. El store (useRecientes) las aplica al navegar.

export const MAX_RECIENTES = 8;

/** Vistas que cuentan como «abierto»: los árboles y subárboles, una unidad, una persona, Directorio y Revisión. */
const VISTAS_RECIENTES = ["arbol", "arboles", "directorio", "revision"];
export const esVistaReciente = (nombre: unknown): boolean =>
  typeof nombre === "string" && VISTAS_RECIENTES.includes(nombre);

export interface Reciente {
  /** Ruta completa (path + query), la misma forma que la de una pestaña. */
  ruta: string;
  /** Cuándo se abrió, en ms desde 1970. */
  en: number;
}

/** Pone `ruta` al frente: sin repetidos (reemplaza a la anterior) y con a lo más MAX_RECIENTES. */
export const agregarReciente = (lista: Reciente[], ruta: string, en: number): Reciente[] =>
  [{ ruta, en }, ...lista.filter((r) => r.ruta !== ruta)].slice(0, MAX_RECIENTES);

/**
 * Lee lo guardado (JSON ya parseado, de cualquier forma): descarta lo mal formado, los repetidos y las rutas que `valida`
 * rechaza (una vista que ya no existe, una unidad o persona eliminada). Respeta el orden guardado.
 */
export function leerRecientes(crudo: unknown, valida: (ruta: string) => boolean): Reciente[] {
  const vistos = new Set<string>();
  const lista: Reciente[] = [];
  for (const x of Array.isArray(crudo) ? crudo : []) {
    if (lista.length >= MAX_RECIENTES) break;
    const r = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
    if (typeof r.ruta !== "string" || vistos.has(r.ruta) || !valida(r.ruta)) continue;
    vistos.add(r.ruta);
    lista.push({ ruta: r.ruta, en: typeof r.en === "number" && Number.isFinite(r.en) ? r.en : 0 });
  }
  return lista;
}

/** Hace cuánto: null = hace un momento (menos de un minuto, o una hora en el futuro por un cambio de reloj). */
export function hace(en: number, ahora: number): { valor: number; unidad: "minute" | "hour" | "day" } | null {
  const min = Math.floor((ahora - en) / 60_000);
  if (min < 1) return null;
  if (min < 60) return { valor: -min, unidad: "minute" };
  if (min < 1440) return { valor: -Math.floor(min / 60), unidad: "hour" };
  return { valor: -Math.floor(min / 1440), unidad: "day" };
}
