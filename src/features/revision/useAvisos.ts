import { computed, type ComputedRef } from "vue";
import { useOrganizacion } from "@/stores/organizacion";
import { leerMarcas, type Marcas } from "./marcas";
import { avisos, listarAvisos, revisar, type Avisos } from "./revision";

interface Estado {
  avisos: Avisos;
  /** Las marcas guardadas, tal cual (la vista las poda con `vigentes` al escribir). */
  marcas: Marcas;
  /** Claves de los avisos que existen hoy, marcados o no. */
  vigentes: Set<string>;
  /** Los pendientes: lo que muestra el menú. */
  total: number;
}

// Un solo cálculo por cambio del store, compartido por el menú (contador) y la vista; uno por store (cada pinia).
const compartidos = new WeakMap<object, ComputedRef<Estado>>();

export function useAvisos(): ComputedRef<Estado> {
  const s = useOrganizacion();
  let c = compartidos.get(s);
  if (!c) {
    c = computed(() => {
      const a = avisos(s);
      const marcas = leerMarcas(s.marcasRevision);
      return {
        avisos: a,
        marcas,
        vigentes: new Set(listarAvisos(a).map((x) => x.clave)),
        total: revisar(a, marcas, null).total,
      };
    });
    compartidos.set(s, c);
  }
  return c;
}
