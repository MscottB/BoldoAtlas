// «Abierto recientemente» (Inicio): hace cuánto se abrió cada organización.

/** Hace cuánto: null = hace un momento (menos de un minuto, o una hora en el futuro por un cambio de reloj). */
export function hace(en: number, ahora: number): { valor: number; unidad: "minute" | "hour" | "day" } | null {
  const min = Math.floor((ahora - en) / 60_000);
  if (min < 1) return null;
  if (min < 60) return { valor: -min, unidad: "minute" };
  if (min < 1440) return { valor: -Math.floor(min / 60), unidad: "hour" };
  return { valor: -Math.floor(min / 1440), unidad: "day" };
}
