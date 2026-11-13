import { hasInjectionContext, inject, type InjectionKey } from "vue";
import type { Panel } from "./pestanas";
import { usePestanas } from "./usePestanas";

/** El panel donde se montó una vista y la pestaña que muestra. */
export interface InfoPanel {
  panel: Panel;
  pestana: () => string;
}
/** Lo provee cada panel de la vista dividida (VistaDividida el principal, PanelLado el de al lado). */
export const PANEL: InjectionKey<InfoPanel> = Symbol("panel");

/**
 * El panel de la vista que llama. Fuera de los paneles (la paleta, la ficha, los atajos), el panel con foco, que se lee
 * cada vez: quien lo guarda en su `setup` sigue al foco.
 */
export function usePanel(): InfoPanel {
  const dado = hasInjectionContext() ? inject(PANEL, null) : null;
  if (dado) return dado;
  const pestanas = usePestanas();
  return {
    get panel() {
      return pestanas.conFoco;
    },
    pestana: () => (pestanas.conFoco === "lado" && pestanas.lado) || pestanas.activa,
  };
}

/** El panel donde se montó quien llama; fuera de los paneles, el principal. Para el estado del lienzo de cada panel. */
export const panelPropio = (): Panel => (hasInjectionContext() && inject(PANEL, null)?.panel) || "principal";

/**
 * Lo que usa los datos de la abierta (una unidad, una persona o una vacante de la paleta) no actúa en el panel de otra
 * organización: con el foco ahí, pasa al principal.
 */
export function alPanelDeLaAbierta(): void {
  const pestanas = usePestanas();
  if (pestanas.otraConFoco()) pestanas.enfocarPanel("principal");
}

/**
 * Lleva el foco del teclado al panel `p`. Si muestra otra organización, adentro del iframe: el panel de la ventana no
 * tiene nada que leer.
 */
export function enfocarElPanel(p: Panel): void {
  const el = document.querySelector<HTMLElement>(`[data-panel="${p}"]`);
  const marco = el?.querySelector("iframe");
  if (!marco) return void el?.focus();
  marco.focus();
  marco.contentWindow?.focus();
}

/** El elemento del panel `p`, para buscar dentro de él lo que puede estar en los dos; sin él, el documento. */
export const raizDelPanel = (p: Panel): ParentNode =>
  document.querySelector(`[data-panel="${p}"]`) ?? document;

/**
 * Atributos de cada panel de la vista dividida: con un foco o un clic dentro, pasa a ser el panel con foco y se marca.
 * Con la vista dividida recibe el foco de F6.
 */
export function propsPanel(p: Panel) {
  const pestanas = usePestanas();
  const enfocar = () => pestanas.enfocarPanel(p);
  return {
    "data-panel": p,
    "aria-current": pestanas.lado && pestanas.conFoco === p ? ("true" as const) : undefined,
    tabindex: pestanas.lado ? -1 : undefined,
    onFocusin: enfocar,
    onPointerdown: enfocar,
  };
}
