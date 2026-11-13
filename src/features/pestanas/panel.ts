import { hasInjectionContext, inject, type InjectionKey } from "vue";
import type { Panel } from "./pestanas";
import { usePestanas } from "./usePestanas";

/** El panel donde se montó una vista y la pestaña que muestra. */
export interface InfoPanel {
  panel: Panel;
  pestana: () => string;
}
/** Lo provee el panel de al lado; el principal no provee nada. */
export const PANEL: InjectionKey<InfoPanel> = Symbol("panel");

/** El panel de la vista que llama: el de al lado si lo proveyó, si no el principal con la activa. */
export function usePanel(): InfoPanel {
  return (
    (hasInjectionContext() ? inject(PANEL, null) : null) ?? {
      panel: "principal",
      pestana: () => usePestanas().activa,
    }
  );
}

/** Atributos de cada panel de la vista dividida: con un foco o un clic dentro, pasa a ser el panel con foco y se marca. */
export function propsPanel(p: Panel) {
  const pestanas = usePestanas();
  const enfocar = () => pestanas.enfocarPanel(p);
  return {
    "data-panel": p,
    "aria-current": pestanas.lado && pestanas.conFoco === p ? ("true" as const) : undefined,
    onFocusin: enfocar,
    onPointerdown: enfocar,
  };
}
