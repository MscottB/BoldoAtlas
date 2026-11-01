import { useRoute, useRouter, type RouteLocationRaw } from "vue-router";
import { i18n } from "@/i18n";
import { abrirEnPestanaNueva } from "@/features/pestanas/usePestanas";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import { unidadesDeRama } from "./layout";
import type { Ubicacion } from "./ubicar";
import { useLienzo } from "./useLienzo";

/** El árbol completo con la unidad del puesto revelada y el puesto ubicado (VistaArbol lee ?ver= y ?puesto=). */
export const rutaPuesto = (p: { id: string; unidad_id: string }): RouteLocationRaw => ({
  name: "arbol",
  query: { ver: p.unidad_id, puesto: p.id },
});

/** «Ver en el organigrama»: lleva al lienzo con el puesto de una persona a la vista. */
export function useUbicar() {
  const route = useRoute();
  const router = useRouter();
  const org = useOrganizacion();
  const { revelarPuesto, puestosDePersona } = useLienzo();

  /**
   * En la pestaña activa (o en una nueva con `nueva`, como Ctrl+clic). Ya en el árbol y con la unidad dentro de la rama
   * enfocada basta revelarla; si no (otra vista, otra rama o un subárbol guardado que no la incluye), se abre el árbol
   * completo con ella.
   */
  function ubicar(puestoId: string, nueva = false): Resultado {
    const p = org.enFecha.puestos.find((x) => x.id === puestoId);
    if (!p || !org.enFecha.porId.has(p.unidad_id))
      return { ok: false, mensaje: i18n.global.t("ubicar.noEsta") };
    if (nueva) {
      abrirEnPestanaNueva(rutaPuesto(p)); // avisa por su cuenta si no se puede
      return { ok: true };
    }
    const raiz = route.query.raiz;
    const dentro =
      typeof raiz !== "string" ||
      unidadesDeRama(org.enFecha.unidades, raiz).some((u) => u.id === p.unidad_id);
    if (route.name === "arbol" && dentro) return revelarPuesto(p.id);
    void router.push(rutaPuesto(p));
    return { ok: true };
  }

  return {
    ubicar,
    /** Los puestos vigentes de la persona en lo que muestra el lienzo (hoy o la fecha que se ve). */
    ubicaciones: (personaId: string | null) => (personaId && puestosDePersona.value.get(personaId)) || [],
    /** «Cargo · Unidad», con «(reemplazo)» si lo es. */
    textoDe: (u: Ubicacion) =>
      i18n.global.t(u.reemplazo ? "ubicar.opcionReemplazo" : "ubicar.opcion", {
        cargo: org.catalogos.cargos.find((c) => c.id === u.cargoId)?.nombre ?? "",
        unidad: org.enFecha.porId.get(u.unidadId)?.nombre ?? "",
      }),
  };
}
