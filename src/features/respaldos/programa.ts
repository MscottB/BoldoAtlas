// Preferencia por PC: cada cuánto se respalda solo. La fecha del último respaldo sale de la carpeta.
export const FRECUENCIAS = ["nunca", "abrir", "24h", "7d"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];
export const FRECUENCIA_POR_DEFECTO: Frecuencia = "24h";

const HORAS: Record<string, number> = { abrir: 0, "24h": 24, "7d": 24 * 7 };

/** `alAbrir` false: revisión con la app ya abierta, que no cuenta como abrirla ni repite nada en cada vuelta. */
export function tocaRespaldar(frecuencia: string, ultimo: Date | null, ahora: Date, alAbrir = true): boolean {
  if (frecuencia === "nunca" || (frecuencia === "abrir" && !alAbrir)) return false;
  if (!ultimo) return true;
  const transcurrido = ahora.getTime() - ultimo.getTime();
  // transcurrido < 0: el último respaldo quedó "en el futuro" porque el reloj cambió. Solo al abrir: si no, respaldaría
  // en cada revisión hasta que el reloj alcance a ese respaldo.
  if (transcurrido < 0) return alAbrir;
  return transcurrido >= (HORAS[frecuencia] ?? HORAS[FRECUENCIA_POR_DEFECTO]) * 3_600_000;
}

/** `fecha` viene de Rust como `AAAA-MM-DDTHH:MM` sin zona, que JS lee como hora local. Un archivo ilegible no cuenta. */
export function ultimoRespaldo(lista: { fecha: string; legible: boolean }[]): Date | null {
  const tiempos = lista.filter((r) => r.legible).map((r) => new Date(r.fecha).getTime());
  return tiempos.length ? new Date(Math.max(...tiempos)) : null;
}
