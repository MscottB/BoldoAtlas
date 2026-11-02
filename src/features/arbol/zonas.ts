import type { Zona } from "@/db/tipos";
import type { Caja } from "./lateral";

export interface Recuadro {
  zona: Zona;
  caja: Caja;
}

export interface ZonasDibujadas {
  /** Las zonas cuyo recuadro no cubre a ninguna otra tarjeta. */
  recuadros: Recuadro[];
  /** Las demás, para la leyenda: se ven como una marca de color en sus unidades. */
  marcadas: Zona[];
  /** Unidad → sus zonas marcadas. */
  marcas: Map<string, Zona[]>;
}

const seCruzan = (a: Caja, b: Caja) =>
  a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;

/**
 * Cómo se ve cada zona con lo que está dibujado. Cuentan sus unidades a la vista y los puestos de ellas. Una zona sin nada a
 * la vista no aparece. `margen` es el aire alrededor de las tarjetas; lo que entra en él también cuenta como cubierto.
 */
export function zonasDibujadas(
  zonas: Zona[],
  pertenencias: { zona_id: string; unidad_id: string }[],
  cajas: ReadonlyMap<string, Caja>,
  puestos: { id: string; unidad_id: string }[],
  margen: number,
): ZonasDibujadas {
  const salida: ZonasDibujadas = { recuadros: [], marcadas: [], marcas: new Map() };
  for (const zona of zonas) {
    const unidades = pertenencias
      .filter((p) => p.zona_id === zona.id && cajas.has(p.unidad_id))
      .map((p) => p.unidad_id);
    if (!unidades.length) continue;
    const propias = new Set(unidades);
    const tarjetas = [...unidades, ...puestos.filter((p) => propias.has(p.unidad_id)).map((p) => p.id)];
    for (const p of tarjetas) propias.add(p);
    const dentro = tarjetas.flatMap((id) => cajas.get(id) ?? []);
    const x = Math.min(...dentro.map((c) => c.x)) - margen;
    const y = Math.min(...dentro.map((c) => c.y)) - margen;
    const caja = {
      x,
      y,
      ancho: Math.max(...dentro.map((c) => c.x + c.ancho)) + margen - x,
      alto: Math.max(...dentro.map((c) => c.y + c.alto)) + margen - y,
    };
    const cubre = [...cajas].some(([id, c]) => !propias.has(id) && seCruzan(caja, c));
    if (!cubre) {
      salida.recuadros.push({ zona, caja });
      continue;
    }
    salida.marcadas.push(zona);
    for (const u of unidades) salida.marcas.set(u, [...(salida.marcas.get(u) ?? []), zona]);
  }
  return salida;
}
