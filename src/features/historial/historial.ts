import type { AccionBreve } from "./tipos";

/** Las acciones (de la más nueva a la más antigua) agrupadas por su día en la zona horaria `zona`, AAAA-MM-DD. */
export function agruparPorDia(a: AccionBreve[], zona: string): { dia: string; acciones: AccionBreve[] }[] {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" });
  const grupos: { dia: string; acciones: AccionBreve[] }[] = [];
  for (const x of a) {
    const d = dia.format(new Date(x.fecha));
    const ultimo = grupos.at(-1);
    if (ultimo?.dia === d) ultimo.acciones.push(x);
    else grupos.push({ dia: d, acciones: [x] });
  }
  return grupos;
}

/** Dónde va la línea «Estás aquí»: antes de la primera hecha (lo de arriba está deshecho). -1 si no hay ninguna. */
export const posicionEstasAqui = (a: AccionBreve[]): number => a.findIndex((x) => x.estado === "hecha");

/** Los días elegidos (AAAA-MM-DD, locales) como los pide Rust: el inicio de `desde` y el del día después de `hasta`, en UTC. */
export function instantes(desde: string, hasta: string): { desde?: string; hasta?: string } {
  const inicio = (dia: string, mas: number) => {
    const [a, m, d] = dia.split("-").map(Number);
    return new Date(a!, m! - 1, d! + mas).toISOString();
  };
  return { desde: desde ? inicio(desde, 0) : undefined, hasta: hasta ? inicio(hasta, 1) : undefined };
}

export type Destino = { unidad: string } | { puesto: { id: string; unidad_id: string } } | { persona: string };

/** «Ir a»: la primera fila de la muestra que sigue existiendo. Una asignación lleva a su persona. */
export function destinoDe(
  a: AccionBreve,
  datos: {
    porId: Map<string, unknown>;
    puestos: { id: string; unidad_id: string }[];
    trabajadores: { id: string }[];
    asignaciones: { id: string; trabajador_id: string }[];
  },
): Destino | null {
  const persona = (id: string | undefined) => (id && datos.trabajadores.some((w) => w.id === id) ? id : null);
  for (const f of a.muestra) {
    if (f.tabla === "unidades" && datos.porId.has(f.fila_id)) return { unidad: f.fila_id };
    const p = f.tabla === "puestos" && datos.puestos.find((x) => x.id === f.fila_id);
    if (p) return { puesto: { id: p.id, unidad_id: p.unidad_id } };
    const w =
      f.tabla === "trabajadores"
        ? persona(f.fila_id)
        : f.tabla === "asignaciones"
          ? persona(datos.asignaciones.find((x) => x.id === f.fila_id)?.trabajador_id)
          : null;
    if (w) return { persona: w };
  }
  return null;
}

/** Lo más que da `historial_pagina` de una vez. */
export const MAX_PAGINA = 200;

/**
 * Hasta `n` acciones (Infinity: todas) que siguen a `antes`, pidiendo páginas de hasta 200 a `pagina`. `fin`: no hay más.
 * Así se recarga lo que ya se veía tras un cambio y se exporta la lista entera.
 */
export async function leerVarias(
  pagina: (antes: string | null, cuantas: number) => Promise<AccionBreve[]>,
  antes: string | null,
  n: number,
): Promise<{ acciones: AccionBreve[]; fin: boolean }> {
  const acciones: AccionBreve[] = [];
  for (;;) {
    const pide = Math.min(MAX_PAGINA, n - acciones.length);
    const p = await pagina(acciones.at(-1)?.id ?? antes, pide);
    acciones.push(...p);
    if (p.length < pide) return { acciones, fin: true };
    if (acciones.length >= n) return { acciones, fin: false };
  }
}
