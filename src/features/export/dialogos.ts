import { toast } from "vue-sonner";
import { archivoAbrirCarpeta } from "@/db/cliente";
import { i18n } from "@/i18n";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import type { useOrganizacion } from "@/stores/organizacion";
import type { Alcance } from "./preparar";

// Lo que comparten las ventanas de exportar como imagen/PDF y del manual.

type Org = ReturnType<typeof useOrganizacion>;

/** Lo que dice el selector: «Toda la organización» o el nombre de la unidad. */
export const textoDelAlcance = (a: Alcance, org: Org, t: (k: string) => string) =>
  a === "todo" ? t("imagen.alcanceTodo") : org.enFecha.porId.get(a.rama)!.nombre;

/**
 * Lo que, si cambia mientras se arma, deja viejo el resultado: el organigrama y lo que lee el encabezado (nombre y logo
 * de la organización). Para `watch`.
 */
export const fuentesDelOrganigrama = (org: Org) =>
  [() => org.enFecha, () => org.catalogos, () => org.org.nombre, () => org.org.logo] as const;

/** «Guardado: …», con «Abrir carpeta». */
export const avisarGuardado = (nombre: string, descripcion?: string) =>
  toast.success(i18n.global.t("imagen.guardada", { nombre }), {
    description: descripcion,
    duration: 10000,
    action: {
      label: i18n.global.t("excel.abrirCarpeta"),
      onClick: () => void archivoAbrirCarpeta().catch((x: unknown) => toast.error(mensajeFallo(x))),
    },
  });
