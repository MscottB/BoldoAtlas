import type { Leyenda, Unidad } from "@/db/tipos";
import { clasesEnUso, colorDeClase, esCriterioEscala, type Traducir, type ValorEscala } from "./escala";
import { leyendaDeMarcas, type Marca } from "./jerarquia";
import { CRITERIO_LEYENDA, leyendasEnUso } from "./vista";

// Fuera del componente: también la usa la imagen exportada (export/treeSvg).
/** Una fila de la leyenda: una marca (con código), una entrada de leyenda de puestos (con descripción) o un tipo de línea (`trazo`). */
export interface EntradaLeyenda {
  clave: string;
  color: string | null;
  codigo?: string | null;
  nombre: string;
  descripcion?: string | null;
  trazo?: "punteado" | "puntos" | "continuo";
}

/**
 * La leyenda de «Colorear por» de lo dibujado (unidades y puestos del subgrafo): la del lienzo y la de la imagen.
 * `escala`: escalaPorTarjeta (solo con un criterio de escala); `marcas`: marcasPorUnidad del tipo `tipoMarca`.
 */
export function leyendaDeColores(o: {
  criterio: string;
  escala: ReadonlyMap<string, ValorEscala> | null;
  marcas: Map<string, Marca | null> | null;
  tipoMarca: string | null;
  tipos: { id: string; nombre: string }[];
  leyendas: Leyenda[];
  nodos: Unidad[];
  puestos: { id: string; leyenda_id: string | null }[];
  t: Traducir;
}): { titulo: string; entradas: EntradaLeyenda[] } {
  const { t } = o;
  const c = esCriterioEscala(o.criterio) ? o.criterio : null;
  if (c && o.escala)
    return {
      titulo: t(`arbol.vista.${c}`),
      entradas: clasesEnUso(o.escala, [...o.nodos.map((u) => u.id), ...o.puestos.map((p) => p.id)]).map(
        (x) => ({
          clave: String(x),
          color: colorDeClase(x),
          nombre: t(typeof x === "number" ? `arbol.vista.rangos.${c}.${x}` : `arbol.vista.aparte.${x}`),
        }),
      ),
    };
  if (o.criterio === CRITERIO_LEYENDA)
    return {
      titulo: t("arbol.vista.leyendaPuesto"),
      entradas: leyendasEnUso(o.puestos, o.leyendas).map((l) => ({
        clave: l.id,
        color: l.color,
        nombre: l.nombre,
        descripcion: l.descripcion,
      })),
    };
  return {
    titulo: t("arbol.vista.marcaDe", { tipo: o.tipos.find((x) => x.id === o.tipoMarca)?.nombre ?? "" }),
    entradas: o.marcas
      ? leyendaDeMarcas(o.marcas, o.nodos).map((m) => ({
          clave: m.unidad.id,
          color: m.color,
          codigo: m.codigo,
          nombre: m.unidad.nombre,
        }))
      : [],
  };
}
