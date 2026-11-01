// Preferencia por PC: cada cuánto se buscan versiones nuevas (spec §12). Por defecto, cada día, igual en la
// instalada y en la portable. La consulta solo lee la lista pública de versiones: no envía datos.
export const FRECUENCIAS = ["nunca", "abrir", "cadaHora", "seisHoras", "diaria", "semanal"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];
export const FRECUENCIA_POR_DEFECTO: Frecuencia = "diaria";

const HORAS: Record<string, number> = { cadaHora: 1, seisHoras: 6, diaria: 24, semanal: 24 * 7 };

/**
 * Si toca buscar. `alAbrir` es la revisión del arranque: consulta siempre (salvo «Nunca») porque la versión encontrada
 * no se guarda y sin esto el aviso desaparecería al reabrir. Después la app revisa cada pocos minutos si ya pasó el
 * plazo. `ultima`: milisegundos de la última consulta que respondió.
 */
export function tocaBuscar(
  frecuencia: string,
  ultima: number | null,
  ahora: number,
  alAbrir: boolean,
): boolean {
  if (frecuencia === "nunca") return false;
  if (alAbrir) return true;
  if (frecuencia === "abrir") return false;
  if (ultima === null) return true;
  const transcurrido = ahora - ultima;
  // transcurrido < 0: el reloj cambió y la última consulta quedó «en el futuro»
  return (
    transcurrido < 0 || transcurrido >= (HORAS[frecuencia] ?? HORAS[FRECUENCIA_POR_DEFECTO]!) * 3_600_000
  );
}
