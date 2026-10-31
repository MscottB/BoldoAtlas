import type { ComputedRef, InjectionKey } from "vue";
import type { Leyenda, Unidad } from "@/db/tipos";
import type { Marca } from "./jerarquia";

/**
 * Lo que cada tarjeta lee por su cuenta (lo provee VistaArbol). Así cambiar «Colorear por», la ruta, la leyenda o el nivel
 * de detalle repinta solo las tarjetas afectadas, sin rehacer los nodos de Vue Flow.
 */
export interface ContextoLienzo {
  /** Marca de cada unidad según «Colorear por»; null = no se colorea por marca. */
  marcas: ComputedRef<Map<string, Marca | null> | null>;
  /** Superiores por tipo (ver rutasPorTipo); null = la vista no muestra la ruta. */
  rutas: ComputedRef<Map<string, Unidad[]> | null>;
  /** Entradas de leyenda por id, cuando se colorea por la leyenda del puesto; si no, null. */
  leyendas: ComputedRef<Map<string, Leyenda> | null>;
  /** Tarjetas ligeras: alejado y con muchas tarjetas (rendimiento.ts). */
  ligera: ComputedRef<boolean>;
  /** Encuadra todo el árbol; con el minimapa a la vista deja libre su franja, para que no tape tarjetas. */
  encuadrar: () => Promise<boolean>;
}

export const CONTEXTO_LIENZO: InjectionKey<ContextoLienzo> = Symbol("contextoLienzo");
