import { getCurrentWindow } from "@tauri-apps/api/window";
import { tituloVentana } from "./estructura";

/** Pone «BoldoAtlas — organización» como título de la ventana. Fuera de Tauri no hay ventana: no hace nada. */
export async function ponerTitulo(organizacion: string): Promise<void> {
  try {
    await getCurrentWindow().setTitle(tituloVentana(organizacion));
  } catch {
    /* sin ventana nativa (vista previa en el navegador) */
  }
}
