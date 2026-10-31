import { TIPO_AREA, TIPO_GERENCIA, TIPO_OTRA, TIPO_SUBAREA, type ValorCatalogo } from "@/db/tipos";
import type { Idioma } from "@/i18n";

// La migración siembra los tipos en español; con la interfaz en inglés se ofrecen sus nombres en inglés.
const SEMILLAS: Record<string, { es: string; en: string }> = {
  [TIPO_GERENCIA]: { es: "Gerencia", en: "Management" },
  [TIPO_AREA]: { es: "Área", en: "Area" },
  [TIPO_SUBAREA]: { es: "Subárea", en: "Sub-area" },
  [TIPO_OTRA]: { es: "Otra", en: "Other" },
};

/** Tipos sembrados que siguen activos, sin uso y con su nombre original en español: a renombrar si la interfaz está en inglés. */
export function tiposARenombrar(
  tipos: readonly ValorCatalogo[],
  usos: (id: string) => number,
  idioma: Idioma,
): { id: string; nombre: string }[] {
  if (idioma !== "en") return [];
  const activos = tipos.filter((t) => !t.deleted_at);
  return activos.flatMap((t) => {
    const semilla = SEMILLAS[t.id];
    const libre = !activos.some((o) => o.nombre.toLowerCase() === semilla?.en.toLowerCase());
    return semilla && t.nombre === semilla.es && usos(t.id) === 0 && libre
      ? [{ id: t.id, nombre: semilla.en }]
      : [];
  });
}
