import { usePestanas } from "@/features/pestanas/usePestanas";

/**
 * Cierra Configuración, Ayuda o Acerca de: vuelve a la vista de esta pestaña desde la que se abrió o, si no la hay, al
 * árbol. No usa la historia del navegador: cambiar de pestaña la reemplaza y mezclaría las rutas de otras pestañas.
 */
export function useCerrarVista() {
  const pestanas = usePestanas();
  return () => void pestanas.cerrarVista();
}
