import type { Unidad } from "@/db/tipos";
import { colapsadosIniciales } from "./layout";

// Umbrales del lienzo con árboles grandes. Mediciones: docs/superpowers/notas/2026-10-28-prueba-rendimiento.md
// (T14, 2.000 unidades abiertas: ~57.000 elementos en el DOM, arrastre a 7–16 FPS; con 30 tarjetas, 60 FPS).

/**
 * Bajo este zoom la tarjeta normal no se lee (su texto de 12 px queda bajo 6 px) y solo cuesta: con muchas tarjetas se
 * dibuja ligera. El arrastre lo frena el navegador revisando el DOM bajo el puntero en cada evento (HitTest 709 ms en 2 s).
 */
export const ZOOM_DETALLE = 0.5;

/** Desde aquí se aligera el lienzo (tarjetas, aristas y minimapa). Con 30 tarjetas iba a 60 FPS; con 2.000, a 7–16. */
export const MUCHAS_TARJETAS = 300;

/** Expandir más allá de esto pide confirmación: con 2.000 tarjetas dibujar tardaba 3,9–13 s. */
export const LIMITE_TARJETAS = 1000;

export const tarjetasLigeras = (zoom: number, tarjetas: number) =>
  zoom < ZOOM_DETALLE && tarjetas > MUCHAS_TARJETAS;

// Ocultar minimapa y aristas duplicaba el arrastre (6,8 → 14,2 FPS).
export const conMinimapa = (tarjetas: number) => tarjetas <= MUCHAS_TARJETAS;

/** Una acción que deja `despues` tarjetas a la vista (había `antes`) pide confirmación si abre de más. */
export const debeAvisar = (antes: number, despues: number) => despues > LIMITE_TARJETAS && despues > antes;

/**
 * Lo que `objetivo` abriría, pero solo hasta el nivel `n` (1 = las raíces, como «Contraer hasta»): lo que la acción abría
 * más abajo sigue plegado; lo que ya estaba abierto (no plegado en `actual`) no se toca.
 */
export function hastaNivel(
  unidades: Unidad[],
  actual: Set<string>,
  objetivo: Set<string>,
  n: number,
): Set<string> {
  const tope = colapsadosIniciales(unidades, n);
  return new Set([...objetivo, ...[...actual].filter((id) => tope.has(id))]);
}

/** El mayor nivel con el que `hastaNivel` deja `limite` tarjetas o menos (según `contar`); null si ni el 1 cabe. */
export function nivelBajoLimite(
  unidades: Unidad[],
  actual: Set<string>,
  objetivo: Set<string>,
  contar: (colapsados: Set<string>) => number,
  limite = LIMITE_TARJETAS,
): number | null {
  let mejor: number | null = null;
  for (let n = 1; ; n++) {
    const c = hastaNivel(unidades, actual, objetivo, n);
    if (contar(c) > limite) return mejor;
    mejor = n;
    if (c.size === objetivo.size) return mejor; // ya es todo lo que la acción abre
  }
}

type Pendiente<E, S> = {
  id: number;
  datos: E;
  resolver: (r: S | null) => void;
  rechazar: (e: unknown) => void;
};

/**
 * Pedidos de layout a un worker: uno en curso a la vez y, mientras corre, solo el último espera su turno. Un pedido
 * reemplazado, o cuyo resultado (o error) llega cuando ya hay otro más nuevo, resuelve null: ya no sirve.
 */
export function colaDeUltimo<E, S>(enviar: (id: number, datos: E) => void) {
  let ultimo = 0;
  let enCurso: Pendiente<E, S> | null = null;
  let siguiente: Pendiente<E, S> | null = null;
  const arrancar = () => {
    enCurso = siguiente;
    siguiente = null;
    if (enCurso) enviar(enCurso.id, enCurso.datos);
  };
  return {
    pedir: (datos: E) =>
      new Promise<S | null>((resolver, rechazar) => {
        siguiente?.resolver(null);
        siguiente = { id: ++ultimo, datos, resolver, rechazar };
        if (!enCurso) arrancar();
      }),
    recibir(id: number, resultado: S | undefined, error?: unknown) {
      if (enCurso?.id !== id) return;
      const p = enCurso;
      arrancar();
      if (p.id !== ultimo) p.resolver(null);
      else if (error !== undefined) p.rechazar(error);
      else p.resolver(resultado ?? null);
    },
  };
}
