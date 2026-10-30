import { computed, ref, type ComputedRef } from "vue";
import { toast } from "vue-sonner";
import type { Unidad } from "@/db/tipos";
import { i18n } from "@/i18n";
import { normalizarTexto } from "@/lib/texto";
import { useOrganizacion } from "@/stores/organizacion";
import { hijos, tipoHijo } from "./jerarquia";

/** Sin filtros todo coincide; con texto y etiqueta deben cumplirse ambos. */
export function coincideFiltro(u: Unidad, texto: string, etiquetadas: Set<string> | null): boolean {
  if (etiquetadas && !etiquetadas.has(u.id)) return false;
  const buscado = normalizarTexto(texto);
  return !buscado || normalizarTexto(u.nombre).includes(buscado);
}

type Punto = { x: number; y: number };

/** La tarjeta (distinta de la arrastrada) que contiene el centro de la arrastrada. Posiciones = esquina superior izquierda. */
export function destinoAlSoltar(
  id: string,
  pos: Punto,
  posiciones: Map<string, Punto>,
  tam: { ancho: number; alto: number },
): string | null {
  const cx = pos.x + tam.ancho / 2;
  const cy = pos.y + tam.alto / 2;
  for (const [otro, p] of posiciones)
    if (otro !== id && cx >= p.x && cx <= p.x + tam.ancho && cy >= p.y && cy <= p.y + tam.alto) return otro;
  return null;
}

// Estado compartido por el lienzo y el panel de unidad: hay un solo lienzo en la app.
const colapsados = ref(new Set<string>());
const seleccion = ref<string | null>(null);
const editando = ref<string | null>(null);
const filtroEtiqueta = ref<string | null>(null);
const filtroTexto = ref("");
let etiquetadas: ComputedRef<Set<string> | null> | undefined; // uno para todos los nodos

function expandir(id: string) {
  if (!colapsados.value.has(id)) return;
  const s = new Set(colapsados.value);
  s.delete(id);
  colapsados.value = s;
}

export function useLienzo() {
  const org = useOrganizacion();
  etiquetadas ??= computed(() =>
    filtroEtiqueta.value
      ? new Set(
          org.unidadEtiquetas.filter((x) => x.etiqueta_id === filtroEtiqueta.value).map((x) => x.unidad_id),
        )
      : null,
  );

  /** Crea una subunidad de `padre` (o una raíz) con nombre provisorio y la deja seleccionada y en edición. */
  async function nuevaUnidad(padre: Unidad | null) {
    const hermanos = padre ? hijos(org.unidades, padre.id) : org.raices;
    const tipo_id = tipoHijo(org.catalogos.tipos_unidad, padre?.tipo_id ?? null);
    if (!tipo_id) return void toast.error(i18n.global.t("arbol.sinTiposActivos"));
    const r = await org.crearUnidad({
      tipo_id,
      nombre: i18n.global.t("arbol.nuevaUnidad"),
      parent_id: padre?.id ?? null,
      orden: Math.max(-1, ...hermanos.map((h) => h.orden)) + 1,
    });
    if (!r.ok) return void toast.error(r.mensaje);
    if (padre) expandir(padre.id);
    seleccion.value = editando.value = r.id!;
  }

  return {
    colapsados,
    seleccion,
    editando,
    filtroEtiqueta,
    filtroTexto,
    expandir,
    nuevaUnidad,
    alternarRama(id: string) {
      const s = new Set(colapsados.value);
      if (!s.delete(id)) s.add(id);
      colapsados.value = s;
    },
    seleccionar(id: string | null) {
      seleccion.value = id;
    },
    coincide: (u: Unidad) => coincideFiltro(u, filtroTexto.value, etiquetadas!.value),
  };
}
