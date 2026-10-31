import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { useOrganizacion } from "@/stores/organizacion";

// Copiar y pegar el estilo (la entrada de leyenda) de un puesto, con aviso. El portapapeles vive en el store.
export function useEstilo() {
  const { t } = useI18n();
  const org = useOrganizacion();
  const nombre = () => org.leyendas.find((l) => l.id === org.estiloCopiado)?.nombre ?? t("leyenda.sinEstilo");

  function copiar(puestoId: string) {
    const r = org.copiarEstilo(puestoId);
    if (r.ok) toast(t("leyenda.copiado", { nombre: nombre() }));
    else toast.error(r.mensaje);
  }
  async function pegar(puestoId: string) {
    if (org.fechaVista) return; // solo lectura
    const r = await org.pegarEstilo(puestoId);
    if (r.ok) toast(t("leyenda.pegado", { nombre: nombre() }));
    else toast.error(r.mensaje);
  }
  async function quitar(puestoId: string) {
    if (org.fechaVista) return; // solo lectura
    const r = await org.asignarLeyenda(puestoId, null);
    if (!r.ok) toast.error(r.mensaje);
  }
  return { copiar, pegar, quitar };
}
