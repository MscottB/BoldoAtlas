import type { InfoLado } from "@/db/cliente";

// Lo que se estima que agrega otra organización al lado: un segundo Vue con sus datos (decisión 10).
// Medidas en el arnés (`medirLado`) con la grande, 10.000 personas y 2.000 unidades: +23,6 MB, con 50 % encima. El arnés
// imprime las que sugiere cada corrida. Se escriben `<n> * 2 ** <k>`: así las lee.
export const BASE_LADO = 21 * 2 ** 20;
export const POR_PERSONA = 2 * 2 ** 10;
export const POR_UNIDAD = 1 * 2 ** 10;

/** La memoria del montículo de JS que da Chromium (`performance.memory`); otros navegadores no la dan. */
export interface Memoria {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/** Si cabe la otra al lado sin pasar del 80 % del límite. Sin `memoria` no se sabe: no se pregunta. */
export function caben(info: InfoLado, memoria?: Memoria): boolean {
  if (!memoria) return true;
  const estimado = BASE_LADO + info.personas * POR_PERSONA + info.unidades * POR_UNIDAD;
  return memoria.usedJSHeapSize + estimado <= 0.8 * memoria.jsHeapSizeLimit;
}
