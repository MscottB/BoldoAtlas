import type { Unidad } from "@/db/tipos";
import { indiceHijos, porOrden } from "@/features/arbol/jerarquia";

export type Atajo =
  | "paleta"
  | "nuevaUnidad"
  | "buscarLienzo"
  | "eliminar"
  | "cerrar"
  | "encuadrar"
  | "irSuperior"
  | "irPrimerHijo"
  | "irHermanoAnterior"
  | "irHermanoSiguiente";

export type Navegacion = Extract<
  Atajo,
  "irSuperior" | "irPrimerHijo" | "irHermanoAnterior" | "irHermanoSiguiente"
>;

export interface TeclaAtajo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey?: boolean;
  enCampoDeTexto: boolean;
  /** Hay un diálogo, menú o lista abiertos: ellos mandan sobre el teclado. */
  modalAbierto?: boolean;
  /** Vista a una fecha: no se crea ni se elimina nada. */
  soloLectura?: boolean;
  /** El árbol se dibuja de izquierda a derecha: las flechas siguen el dibujo. */
  horizontal?: boolean;
}

const FLECHAS: Record<string, [vertical: Navegacion, horizontal: Navegacion]> = {
  ArrowUp: ["irSuperior", "irHermanoAnterior"],
  ArrowDown: ["irPrimerHijo", "irHermanoSiguiente"],
  ArrowLeft: ["irHermanoAnterior", "irSuperior"],
  ArrowRight: ["irHermanoSiguiente", "irPrimerHijo"],
};

/** Qué atajo (si alguno) es esta pulsación. Pura: quien la llama mide el foco, los diálogos y la fecha. */
export function resolverAtajo(e: TeclaAtajo): Atajo | null {
  if (e.modalAbierto) return null;
  const tecla = e.key.toLowerCase();
  const conControl = e.ctrlKey || e.metaKey;
  if (conControl && tecla === "k") return "paleta";
  if (e.key === "Escape") return "cerrar";
  if (e.ctrlKey && e.key === "0") return "encuadrar";
  if (conControl || e.altKey || e.enCampoDeTexto) return null;
  if (e.key in FLECHAS) return FLECHAS[e.key]![e.horizontal ? 1 : 0];
  if (e.key === "Delete") return e.soloLectura ? null : "eliminar";
  if (tecla === "n") return e.soloLectura ? null : "nuevaUnidad";
  if (tecla === "f") return "buscarLienzo";
  return null;
}

/**
 * Unidad a la que lleva una flecha desde `actual`, dentro de las unidades que se dibujan; null = no hay a dónde ir.
 * Sin selección válida cualquier flecha va a la primera raíz. Los hermanos siguen el orden del dibujo.
 */
export function destinoNavegacion(
  unidades: Unidad[],
  actual: string | null,
  accion: Navegacion,
): string | null {
  const ids = new Set(unidades.map((u) => u.id));
  // En una rama enfocada su raíz cuelga de algo que no se dibuja: se trata como raíz.
  const raices = unidades.filter((u) => !u.parent_id || !ids.has(u.parent_id)).sort(porOrden);
  const u = unidades.find((x) => x.id === actual);
  if (!u) return raices[0]?.id ?? null;
  const indice = indiceHijos(unidades);
  const hermanos = u.parent_id && ids.has(u.parent_id) ? (indice.get(u.parent_id) ?? []) : raices;
  const i = hermanos.findIndex((x) => x.id === u.id);
  switch (accion) {
    case "irSuperior":
      return (u.parent_id && ids.has(u.parent_id) && u.parent_id) || null;
    case "irPrimerHijo":
      return indice.get(u.id)?.[0]?.id ?? null;
    case "irHermanoAnterior":
      return hermanos[i - 1]?.id ?? null;
    case "irHermanoSiguiente":
      return hermanos[i + 1]?.id ?? null;
  }
}
