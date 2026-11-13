import { DIVISION_INICIAL, PROPORCION_MAX, PROPORCION_MIN, type Division } from "./pestanas";

const PASO = 0.05;
const PASOS = new Map([
  ["ArrowLeft", -PASO],
  ["ArrowUp", -PASO],
  ["ArrowRight", PASO],
  ["ArrowDown", PASO],
]);
const acotar = (p: number) => Math.min(Math.max(p, PROPORCION_MIN), PROPORCION_MAX);

/** La proporción tras una tecla o un doble clic (`dblclick`) en el divisor; null si eso no lo mueve. */
export function nuevaProporcion(accion: string, p: number): number | null {
  if (accion === "Home") return PROPORCION_MIN;
  if (accion === "End") return PROPORCION_MAX;
  if (accion === "dblclick") return DIVISION_INICIAL.proporcion;
  const paso = PASOS.get(accion);
  // En centésimas: sumando 0.05 se acumularían decimales (0.55000000000000004).
  return paso === undefined ? null : acotar(Math.round((p + paso) * 100) / 100);
}

/**
 * Al arrastrar: el centro del divisor queda bajo el puntero. Los paneles se reparten lo que deja el divisor (`grosor`),
 * así que se mide sobre eso. Acotada, sin redondear.
 */
export function proporcionDelPuntero(
  orientacion: Division["orientacion"],
  { x, y }: { x: number; y: number },
  caja: { left: number; top: number; width: number; height: number },
  grosor: number,
): number {
  const [desde, largo] =
    orientacion === "horizontal" ? [x - caja.left, caja.width] : [y - caja.top, caja.height];
  return acotar((desde - grosor / 2) / (largo - grosor));
}

/** Al soltar el divisor, la proporción que se guarda (en centésimas); null si no se arrastró o no cambió. */
export function finDelArrastre(guardada: number, arrastre: number | null): number | null {
  if (arrastre === null) return null;
  const p = Math.round(arrastre * 100) / 100;
  return p === guardada ? null : p;
}
