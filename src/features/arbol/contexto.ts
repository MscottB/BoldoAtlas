import type { ComputedRef, InjectionKey } from "vue";
import type { Leyenda, Unidad } from "@/db/tipos";
import type { Marca } from "./jerarquia";
import type { Trazado } from "./lateral";

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
  /** Por dónde va cada conexión lateral; se calcula al llegar un layout. */
  trazados: ComputedRef<ReadonlyMap<string, Trazado>>;
  /** La tarjeta bajo el puntero o con el foco del teclado (null si ninguna, en ligero o al arrastrar). */
  tarjetaActiva: ComputedRef<string | null>;
  /** La tarjeta con el foco del teclado: también muestra sus acciones, aunque el puntero esté en otra. */
  tarjetaEnfocada: ComputedRef<string | null>;
  /** Conexiones de la tarjeta activa: se resaltan y las demás se atenúan. null = ninguna en particular. */
  relacionesActivas: ComputedRef<ReadonlySet<string> | null>;
  /** Encuadra todo el árbol; con el minimapa a la vista deja libre su franja, para que no tape tarjetas. */
  encuadrar: () => Promise<boolean>;
}

export const CONTEXTO_LIENZO: InjectionKey<ContextoLienzo> = Symbol("contextoLienzo");
