import { toast } from "vue-sonner";
import { useActualizaciones } from "@/stores/actualizaciones";

/** «Buscar actualizaciones» de Acerca de, Configuración, el menú de la app y la paleta: si hay, abre la ventana. */
export async function buscarActualizaciones(): Promise<void> {
  const r = await useActualizaciones().buscar(true);
  if (!r.ok) toast.error(r.mensaje);
  else if (r.mensaje) toast.success(r.mensaje);
}
