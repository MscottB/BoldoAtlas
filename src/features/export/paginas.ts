import type { Nivel } from "./niveles";
import { letraMinima } from "./treeSvg";

/** Cómo se reparte el PDF en páginas. Todo es puro: pdfmake solo pinta lo que esto decide. Una unidad SVG vale 1 punto. */
export type Hoja = "carta" | "oficio" | "a4" | "a3" | "a2";
export type Orientacion = "horizontal" | "vertical";
export type Reparto = "una" | "ramas" | "cuadricula";

/** En puntos y en vertical. El oficio es el de Chile: 216 × 330 mm. */
export const HOJAS: Record<Hoja, { ancho: number; alto: number }> = {
  carta: { ancho: 612, alto: 792 },
  oficio: { ancho: 612, alto: 936 },
  a4: { ancho: 595.28, alto: 841.89 },
  a3: { ancho: 841.89, alto: 1190.55 },
  a2: { ancho: 1190.55, alto: 1683.78 },
};
export const MARGEN = 28.35; // 1 cm
export const ENCABEZADO = 28;
export const PIE = 22;
export const LETRA_MIN_PT = 8;
export const SOLAPE = 28.35; // 1 cm

/** Lo que queda para el dibujo: la hoja sin márgenes, encabezado ni pie. */
export function areaUtil(hoja: Hoja, orientacion: Orientacion): { ancho: number; alto: number } {
  const { ancho, alto } = HOJAS[hoja];
  const [a, b] = orientacion === "vertical" ? [ancho, alto] : [alto, ancho];
  return { ancho: a - 2 * MARGEN, alto: b - 2 * MARGEN - ENCABEZADO - PIE };
}

/**
 * La escala que hace caber el dibujo en el área útil, y si con ella la letra más chica baja de 8 pt. Un dibujo chico no
 * se agranda: la escala no pasa de 1.
 */
export function escalaParaHoja(
  ancho: number,
  alto: number,
  hoja: Hoja,
  orientacion: Orientacion,
  nivel: Nivel,
): { escala: number; ilegible: boolean } {
  const area = areaUtil(hoja, orientacion);
  const escala = Math.min(1, area.ancho / ancho, area.alto / alto);
  return { escala, ilegible: letraMinima(nivel) * escala < LETRA_MIN_PT };
}

/** Una página del reparto por ramas. */
export interface PaginaRamas {
  /** Desde 1. */
  numero: number;
  /** La unidad de arriba de la página. */
  raiz: string;
  /** Cuántos niveles bajo la raíz se dibujan: 0 es solo la raíz. */
  profundidad: number;
  /** Solo si las hijas de la raíz no caben juntas: el tramo [desde, hasta) de `hijosDe(raiz)`, «parte de partes». */
  hijas?: { desde: number; hasta: number; parte: number; partes: number };
  /** Las unidades de la última fila que tienen hijas: su tarjeta dice «sigue en la página N». */
  sigue: { unidad: string; pagina: number }[];
  /** La página que cortó esta rama, para el «viene de la página M»; null en las de la raíz del alcance. */
  viene: number | null;
}

/** Una unidad quedó debajo de sí misma: el reparto no terminaría. El mensaje es para el registro; la app dice el suyo. */
export class ErrorCiclo extends Error {
  constructor(readonly unidad: string) {
    super(`La unidad ${unidad} está debajo de sí misma: el organigrama tiene un ciclo.`);
    this.name = "ErrorCiclo";
  }
}

/**
 * Reparte el organigrama en páginas legibles, cortando por ramas. `medir` da el tamaño del dibujo de `raiz` con
 * `profundidad` niveles (y, si viene, solo con las hijas del tramo [desde, hasta)); el que llama lo arma con elk.
 *
 * - Cada página lleva tantos niveles como quepan con letra de 8 pt o más. Las unidades de la última fila que tienen
 *   hijas se cortan: cada una empieza su propia página, que se reparte igual.
 * - Las ramas cortadas van a una cola: así las páginas quedan por niveles (BFS) y las del mismo nivel, juntas. El
 *   número de «sigue» se pone al final, cuando ya se sabe dónde empieza cada rama.
 * - Si ni un nivel de hijas cabe, las hijas se reparten en partes, cada una con todas las que quepan.
 * - Una hija que no cabe ni sola va igual en su parte, a la escala que quepa. Cada vuelta avanza al menos una hija y
 *   cada rama cortada es más honda que la que la cortó, así que el reparto siempre termina.
 */
export async function repartirPorRamas(
  raiz: string,
  hijosDe: (id: string) => string[],
  medir: (
    raiz: string,
    profundidad: number,
    hijas?: [number, number],
  ) => Promise<{ ancho: number; alto: number }>,
  hoja: Hoja,
  orientacion: Orientacion,
  nivel: Nivel,
): Promise<PaginaRamas[]> {
  // Cuántos niveles hay bajo cada unidad: más hondo no hay nada que medir. Con una pila y no con recursión, para que
  // una rama muy honda no agote la pila de llamadas. Si una unidad aparece bajo sí misma, los datos están mal: sin
  // este corte, el reparto no terminaría.
  const alturas = new Map<string, number>();
  const altura = (id: string): number => {
    const pila = [id];
    const abiertas = new Set<string>(); // en el camino, con sus hijas todavía por medir
    while (pila.length) {
      const u = pila[pila.length - 1]!;
      if (alturas.has(u)) pila.pop();
      else if (abiertas.has(u)) {
        alturas.set(
          u,
          hijosDe(u).reduce((m, h) => Math.max(m, alturas.get(h)! + 1), 0),
        );
        abiertas.delete(u);
        pila.pop();
      } else {
        abiertas.add(u);
        for (const h of hijosDe(u)) {
          if (abiertas.has(h)) throw new ErrorCiclo(h);
          if (!alturas.has(h)) pila.push(h);
        }
      }
    }
    return alturas.get(id)!;
  };
  const cabe = async (id: string, d: number, tramo?: [number, number]) => {
    const m = await medir(id, d, tramo);
    return !escalaParaHoja(m.ancho, m.alto, hoja, orientacion, nivel).ilegible;
  };
  // La mayor profundidad que cabe, desde `minima` hasta `tope`. Se mide de a un nivel: el dibujo solo crece.
  const mayor = async (id: string, tope: number, tramo?: [number, number], minima = 0) => {
    let d = minima;
    while (d < tope && (await cabe(id, d + 1, tramo))) d++;
    return d;
  };

  const paginas: PaginaRamas[] = [];
  const primera = new Map<string, number>(); // unidad cortada → su primera página
  const cola: { id: string; viene: number | null }[] = [{ id: raiz, viene: null }];
  for (let i = 0; i < cola.length; i++) {
    const { id, viene } = cola[i]!;
    const hijas = hijosDe(id);
    const tramos: { profundidad: number; tramo?: [number, number] }[] = [];
    const d = await mayor(id, altura(id));
    if (d > 0 || !hijas.length) tramos.push({ profundidad: d });
    else
      for (let desde = 0; desde < hijas.length;) {
        let hasta = desde + 1;
        while (hasta < hijas.length && (await cabe(id, 1, [desde, hasta + 1]))) hasta++;
        const tope = hijas.slice(desde, hasta).reduce((m, h) => Math.max(m, altura(h) + 1), 1);
        tramos.push({ profundidad: await mayor(id, tope, [desde, hasta], 1), tramo: [desde, hasta] });
        desde = hasta;
      }
    // Una sola parte con todas las hijas es una página común.
    if (tramos.length === 1) delete tramos[0]!.tramo;

    tramos.forEach(({ profundidad, tramo }, k) => {
      const numero = paginas.length + 1;
      if (k === 0) primera.set(id, numero);
      let fila = profundidad > 0 ? hijas.slice(...(tramo ?? [])) : [];
      for (let n = 1; n < profundidad; n++) fila = fila.flatMap(hijosDe);
      const cortadas = fila.filter((u) => hijosDe(u).length);
      for (const u of cortadas) cola.push({ id: u, viene: numero });
      paginas.push({
        numero,
        raiz: id,
        profundidad,
        ...(tramo && { hijas: { desde: tramo[0], hasta: tramo[1], parte: k + 1, partes: tramos.length } }),
        sigue: cortadas.map((unidad) => ({ unidad, pagina: 0 })),
        viene,
      });
    });
  }
  for (const p of paginas) for (const s of p.sigue) s.pagina = primera.get(s.unidad)!;
  return paginas;
}

/** Una hoja de la cuadrícula. `fila` y `columna` desde 1; el recorte (x, y, ancho, alto), en coordenadas del dibujo. */
export interface Hojita {
  fila: number;
  columna: number;
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/**
 * Corta el dibujo entero, a la escala de 8 pt, en hojas para pegar como póster. Las hojas vecinas comparten `SOLAPE`
 * (1 cm en papel); los bordes del dibujo no llevan solape, y la última hoja de cada fila y columna llega justo al borde.
 * Cada hoja, salvo la primera, empieza 1 cm antes de donde termina la anterior: así no quedan huecos.
 */
export function cuadricula(
  ancho: number,
  alto: number,
  hoja: Hoja,
  orientacion: Orientacion,
  nivel: Nivel,
): { escala: number; filas: number; columnas: number; hojas: Hojita[] } {
  // Como en escalaParaHoja, un dibujo nunca se agranda.
  const escala = Math.min(1, LETRA_MIN_PT / letraMinima(nivel));
  const area = areaUtil(hoja, orientacion);
  const solape = SOLAPE / escala;
  // Los tramos [inicio, fin) de un eje: n hojas cubren n · (lado − solape) + solape.
  const tramos = (total: number, lado: number) => {
    const paso = lado - solape;
    // El 1e-9 evita una hoja de más, casi vacía, por el redondeo cuando el dibujo cabe justo.
    const n = Math.max(1, Math.ceil((total - solape) / paso - 1e-9));
    return Array.from({ length: n }, (_, k) => [k * paso, Math.min(total, k * paso + lado)] as const);
  };
  const xs = tramos(ancho, area.ancho / escala);
  const ys = tramos(alto, area.alto / escala);
  const hojas = ys.flatMap(([y0, y1], f) =>
    xs.map(([x0, x1], c) => ({ fila: f + 1, columna: c + 1, x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 })),
  );
  return { escala, filas: ys.length, columnas: xs.length, hojas };
}
