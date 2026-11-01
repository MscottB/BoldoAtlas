import type { Router } from "vue-router";
import { toast } from "vue-sonner";
import { i18n } from "@/i18n";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { useOrganizacion } from "@/stores/organizacion";
import { paletaAbierta } from "./useAtajos";

/**
 * Abre la paleta de comandos para buscar una persona. La paleta no existe en Inicio (ruta `sinMarco`): con datos se vuelve
 * a la vista activa y se abre; sin datos no hay a quién buscar y se avisa. Lo usan la bandeja y los accesos de Inicio.
 */
export async function buscarPersona(router: Router): Promise<void> {
  if (router.currentRoute.value.meta.sinMarco) {
    if (useOrganizacion().vacia) return void toast.info(i18n.global.t("bandeja.sinPersonas"));
    await usePestanas().volverAlProyecto();
  }
  paletaAbierta.value = true;
}
