// Preferencia por PC: cada cuánto se respalda al abrir la app. La fecha del último respaldo sale de la carpeta.
export const FRECUENCIAS = ["nunca", "abrir", "24h", "7d"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];
export const FRECUENCIA_POR_DEFECTO: Frecuencia = "24h";

const HORAS: Record<string, number> = { abrir: 0, "24h": 24, "7d": 24 * 7 };

export function tocaRespaldar(frecuencia: string, ultimo: Date | null, ahora: Date): boolean {
  if (frecuencia === "nunca") return false;
  if (!ultimo) return true;
  const transcurrido = ahora.getTime() - ultimo.getTime();
  // transcurrido < 0: el último respaldo quedó "en el futuro" porque el reloj cambió.
  return transcurrido < 0 || transcurrido >= (HORAS[frecuencia] ?? HORAS[FRECUENCIA_POR_DEFECTO]) * 3_600_000;
}

/** `fecha` viene de Rust como `AAAA-MM-DDTHH:MM` sin zona, que JS lee como hora local. Un archivo ilegible no cuenta. */
export function ultimoRespaldo(lista: { fecha: string; legible: boolean }[]): Date | null {
  const tiempos = lista.filter((r) => r.legible).map((r) => new Date(r.fecha).getTime());
  return tiempos.length ? new Date(Math.max(...tiempos)) : null;
}
