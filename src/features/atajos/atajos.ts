import type { Unidad } from "@/db/tipos";
import { indiceHijos, porOrden } from "@/features/arbol/jerarquia";

export type Navegacion = "irSuperior" | "irPrimerHijo" | "irHermanoAnterior" | "irHermanoSiguiente";

export type Atajo =
  | Navegacion
  | "paleta"
  | "nuevaUnidad"
  | "buscarLienzo"
  | "eliminar"
  | "cerrar"
  | "encuadrar"
  /** Ctrl+= (o Ctrl++) y Ctrl+-: acercar y alejar el lienzo. */
  | "acercar"
  | "alejar"
  | "duplicar"
  /** Mayús+F10 o la tecla Menú: el menú contextual de la tarjeta enfocada o seleccionada. */
  | "menuContextual"
  /** F2: renombrar la unidad enfocada o seleccionada. */
  | "renombrar"
  /** Ctrl+T, Ctrl+W, Ctrl+Tab y Ctrl+Mayús+Tab: pestañas de trabajo. */
  | "nuevaPestana"
  | "cerrarPestana"
  | "pestanaSiguiente"
  | "pestanaAnterior"
  /** Mayús+flecha: suma a la selección la unidad a la que iría la flecha. */
  | `extender:${Navegacion}`;

export interface TeclaAtajo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  enCampoDeTexto: boolean;
  /** Hay un diálogo, menú o lista abiertos: ellos mandan sobre el teclado. */
  modalAbierto?: boolean;
  /** Vista a una fecha: no se crea ni se elimina nada. */
  soloLectura?: boolean;
  /** El árbol se dibuja de izquierda a derecha: las flechas siguen el dibujo. */
  horizontal?: boolean;
  /** El foco está en un control dentro del panel de la unidad (ver `dentroDelPanel`). */
  enPanel?: boolean;
}

const FLECHAS: Record<string, [vertical: Navegacion, horizontal: Navegacion]> = {
  ArrowUp: ["irSuperior", "irHermanoAnterior"],
  ArrowDown: ["irPrimerHijo", "irHermanoSiguiente"],
  ArrowLeft: ["irHermanoAnterior", "irSuperior"],
  ArrowRight: ["irHermanoSiguiente", "irPrimerHijo"],
};

const PANEL = "[data-panel-unidad]";

/**
 * Un control dentro del panel de la unidad: ahí una tecla suelta no debe actuar sobre el lienzo (Supr eliminaría la
 * unidad). El panel mismo no cuenta: toma el foco al abrirse, justo después de elegir la tarjeta.
 */
export const dentroDelPanel = (el: Element | null) => !!el?.closest(PANEL) && !el.matches(PANEL);

/** Qué atajo (si alguno) es esta pulsación. Pura: quien la llama mide el foco, los diálogos y la fecha. */
export function resolverAtajo(e: TeclaAtajo): Atajo | null {
  if (e.modalAbierto) return null;
  const tecla = e.key.toLowerCase();
  const conControl = e.ctrlKey || e.metaKey;
  if (conControl && tecla === "k") return "paleta";
  if (e.key === "Escape") return "cerrar";
  if (e.ctrlKey && e.key === "0") return "encuadrar";
  // Escribiendo, Ctrl+± queda para el campo (o el navegador).
  if (e.ctrlKey && !e.altKey && (e.key === "=" || e.key === "+" || e.key === "-"))
    return e.enCampoDeTexto ? null : e.key === "-" ? "alejar" : "acercar";
  // Pestañas: valen también escribiendo en un campo (no tienen otro uso ahí), como Ctrl+K.
  if (conControl && !e.altKey && !e.shiftKey && tecla === "t") return "nuevaPestana";
  if (conControl && !e.altKey && !e.shiftKey && tecla === "w") return "cerrarPestana";
  if (e.ctrlKey && !e.altKey && e.key === "Tab") return e.shiftKey ? "pestanaAnterior" : "pestanaSiguiente";
  if (conControl && tecla === "d" && !e.altKey)
    return e.enCampoDeTexto || e.soloLectura || e.enPanel ? null : "duplicar";
  if (conControl || e.altKey || e.enCampoDeTexto || e.enPanel) return null;
  if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) return "menuContextual";
  if (e.key === "F2" && !e.shiftKey) return e.soloLectura ? null : "renombrar";
  if (e.key in FLECHAS) {
    const ir = FLECHAS[e.key]![e.horizontal ? 1 : 0];
    return e.shiftKey ? (e.soloLectura ? null : `extender:${ir}`) : ir;
  }
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
